use super::{Batch, Result, Score};
use rumoca_eval_solve::{PreparedScalarProgramBlock, RowEvalContext};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs::File, io::BufReader, path::Path};

type Matrix = Vec<[f64; 5]>;

// The loader checks these slots against Rumoca's layout before accepting jobs.
const INPUTS: [&str; 18] = [
    "weight",
    "moment",
    "variance",
    "gradient",
    "step",
    "lr",
    "beta1",
    "beta2",
    "epsilon",
    "rewardA",
    "rewardB",
    "futureA",
    "futureB",
    "futureAdv",
    "gamma",
    "total",
    "sampleValue",
    "count",
];

pub struct Optimizer(PreparedScalarProgramBlock);
impl Optimizer {
    pub fn load(path: &Path) -> Result<Self> {
        let ir: Value = serde_json::from_reader(BufReader::new(File::open(path)?))?;
        for (i, name) in INPUTS.iter().enumerate() {
            if ir["layout"]["bindings"][name]["P"]["index"] != json!(i) {
                return Err(format!("unexpected optimizer layout for {name}").into());
            }
        }
        let node = &ir["continuous"]["derivative_rhs"]["nodes"];
        if node.as_array().map(Vec::len) != Some(1) {
            return Err("expected one scalar program block".into());
        }
        let block = PreparedScalarProgramBlock::new(serde_json::from_value(
            node[0]["ScalarPrograms"].clone(),
        )?)?;
        if block.len() != 12 {
            return Err("unexpected optimizer result layout".into());
        }
        Ok(Self(block))
    }
    fn value(&self, row: usize, p: &[f64; 18]) -> Result<f64> {
        let value = self
            .0
            .eval_row_with_context(row, &[], p, 0., RowEvalContext::default())?;
        if !value.is_finite() {
            return Err("nonfinite optimizer result".into());
        }
        Ok(value)
    }
    pub fn reduce(&self, sum: f64, sample: f64, count: Option<usize>) -> Result<f64> {
        let mut p = [0.; 18];
        p[15] = sum;
        p[16] = sample;
        p[17] = count.unwrap_or(1) as f64;
        self.value(if count.is_some() { 9 } else { 8 }, &p)
    }
    pub fn returns(&self, request: Value) -> Result<Value> {
        #[derive(Deserialize)]
        struct Job {
            rewards: Vec<Vec<f64>>,
            gamma: f64,
        }
        let Job { rewards, gamma } = serde_json::from_value(request)?;
        if rewards.is_empty() || rewards.len() % 2 != 0 || !(0. ..=1.).contains(&gamma) {
            return Err(
                "returns require complete pairs of reward sequences and 0 <= gamma <= 1".into(),
            );
        }
        let mut returns = Vec::new();
        let mut advantages = Vec::new();
        let mut sum = 0.;
        for pair in rewards.chunks_exact(2) {
            let n = pair[0].len();
            if n == 0 || pair[1].len() != n {
                return Err("paired episodes must have equal nonzero lengths".into());
            }
            let (mut ra, mut rb, mut aa, mut ab) =
                (vec![0.; n], vec![0.; n], vec![0.; n], vec![0.; n]);
            let mut p = [0.; 18];
            p[14] = gamma;
            for t in (0..n).rev() {
                p[9] = pair[0][t];
                p[10] = pair[1][t];
                ra[t] = self.value(4, &p)?;
                rb[t] = self.value(5, &p)?;
                aa[t] = self.value(6, &p)?;
                ab[t] = self.value(7, &p)?;
                p[11] = ra[t];
                p[12] = rb[t];
                p[13] = aa[t];
            }
            sum = self.reduce(self.reduce(sum, ra[0], None)?, rb[0], None)?;
            returns.extend([ra, rb]);
            advantages.extend([aa, ab]);
        }
        Ok(
            json!({"returns":returns,"advantages":advantages,"meanReturn":self.reduce(sum,0.,Some(rewards.len()))?}),
        )
    }
    pub fn update(&self, score: &Score, request: Value) -> Result<Value> {
        #[derive(Deserialize)]
        struct Job {
            #[serde(flatten)]
            batch: Batch,
            weights: Matrix,
            m: Matrix,
            v: Matrix,
            step: u32,
            lr: Option<f64>,
            beta1: Option<f64>,
            beta2: Option<f64>,
            epsilon: Option<f64>,
        }
        let Job {
            batch,
            mut weights,
            mut m,
            mut v,
            step,
            lr,
            beta1,
            beta2,
            epsilon,
        } = serde_json::from_value(request)?;
        let gradient = score.gradient(&batch, self)?;
        if [weights.len(), m.len(), v.len()]
            .iter()
            .any(|n| *n != gradient.len())
        {
            return Err("weights, m and v must have one row for each sampled action".into());
        }
        let mut p = [0.; 18];
        p[4] = f64::from(step);
        p[5] = lr.unwrap_or(0.032);
        p[6] = beta1.unwrap_or(0.9);
        p[7] = beta2.unwrap_or(0.99);
        p[8] = epsilon.unwrap_or(1e-7);
        if !(0. ..1.).contains(&p[6]) || !(0. ..1.).contains(&p[7]) || p[8] <= 0. || p[5] <= 0. {
            return Err("invalid Adam hyperparameters".into());
        }
        let next_step = self.value(3, &p)? as u64;
        for i in 0..weights.len() {
            for j in 0..weights[i].len() {
                p[0] = weights[i][j];
                p[1] = m[i][j];
                p[2] = v[i][j];
                p[3] = gradient[i][j];
                if p[2] < 0. {
                    return Err("negative Adam variance".into());
                }
                weights[i][j] = self.value(0, &p)?;
                m[i][j] = self.value(1, &p)?;
                v[i][j] = self.value(2, &p)?;
                p[15] = self.value(10, &p)?;
            }
        }
        Ok(
            json!({"gradient":gradient,"gradientNorm":self.value(11,&p)?,"weights":weights,"m":m,"v":v,"step":next_step}),
        )
    }
}
