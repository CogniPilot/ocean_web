mod optimizer;
use optimizer::Optimizer;
use rumoca_eval_solve::reverse::{ReverseCotangents, ReverseInputs, ReverseScratch};
use rumoca_eval_solve::{PreparedScalarProgramBlock, RowEvalContext};
use serde::Deserialize;
use serde_json::{Value, json};
use std::error::Error;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[derive(Deserialize)]
struct Batch {
    features: Vec<[f64; 5]>,
    advantages: Vec<f64>,
    perturbations: Vec<Vec<f64>>,
    sigma: f64,
}

struct Score {
    row: PreparedScalarProgramBlock,
    features: usize,
    shift: usize,
    epsilon: usize,
    sigma: usize,
    slots: usize,
}

impl Score {
    fn load(path: &Path) -> Result<Self> {
        let ir: Value = serde_json::from_reader(BufReader::new(File::open(path)?))?;
        let nodes = ir["continuous"]["derivative_rhs"]["nodes"]
            .as_array()
            .ok_or("expected a derivative block in the score model")?;
        if nodes.len() != 1 {
            return Err("score must compile to one derivative node".into());
        }
        let row = PreparedScalarProgramBlock::new(serde_json::from_value(
            nodes[0]["ScalarPrograms"].clone(),
        )?)?;
        if row.len() != 1 {
            return Err("expected one scalar log score".into());
        }
        let parameter = |name: &str| -> Result<usize> {
            let index = ir["layout"]["bindings"][name]["P"]["index"]
                .as_u64()
                .ok_or_else(|| format!("missing Modelica input {name}"))?;
            Ok(usize::try_from(index)?)
        };
        for name in ["features", "shift"] {
            if ir["layout"]["shapes"][name] != json!([5]) {
                return Err(format!("wrong shape for {name}").into());
            }
        }
        let features = parameter("features")?;
        let shift = parameter("shift")?;
        let epsilon = parameter("epsilon")?;
        let sigma = parameter("sigma")?;
        let slots = (features + 5)
            .max(shift + 5)
            .max(epsilon + 1)
            .max(sigma + 1);
        Ok(Self {
            row,
            features,
            shift,
            epsilon,
            sigma,
            slots,
        })
    }

    fn validate(&self, batch: &Batch) -> Result<()> {
        let n = batch.features.len();
        if n == 0 || batch.advantages.len() != n || batch.perturbations.len() != n {
            return Err(
                "features, advantages and perturbations must have equal nonzero batch length"
                    .into(),
            );
        }
        let actions = batch.perturbations[0].len();
        if actions == 0 || batch.perturbations.iter().any(|row| row.len() != actions) {
            return Err(
                "perturbations must have the same positive action count on every row".into(),
            );
        }
        if !batch.sigma.is_finite() || batch.sigma <= 0.0 {
            return Err("sigma must be positive and finite".into());
        }
        Ok(())
    }

    fn gradient(&self, batch: &Batch, optimizer: &Optimizer) -> Result<Vec<[f64; 5]>> {
        self.validate(batch)?;
        let mut gradient = vec![[0.; 5]; batch.perturbations[0].len()];
        let mut scratch = ReverseScratch::default();
        let mut p = vec![0.; self.slots];
        let mut adjoint = vec![0.; self.slots];
        p[self.sigma] = batch.sigma;
        for ((features, noise), advantage) in batch
            .features
            .iter()
            .zip(&batch.perturbations)
            .zip(&batch.advantages)
        {
            p[self.features..self.features + 5].copy_from_slice(features);
            let output_seed = [optimizer.reduce(0., *advantage, Some(batch.features.len()))?];
            for (g, &perturbation) in gradient.iter_mut().zip(noise) {
                p[self.epsilon] = perturbation;
                adjoint.fill(0.);
                self.row.reverse_vjp(
                    &ReverseInputs {
                        y: &[0.],
                        p: &p,
                        t: 0.,
                        context: RowEvalContext::default(),
                    },
                    &output_seed,
                    &mut ReverseCotangents {
                        y: &mut [],
                        p: &mut adjoint,
                        seed: &mut [],
                    },
                    &mut scratch,
                )?;
                for (g, adj) in g.iter_mut().zip(&adjoint[self.shift..self.shift + 5]) {
                    *g = optimizer.reduce(*g, *adj, None)?;
                }
            }
        }
        if !gradient.iter().flatten().all(|v| f64::is_finite(*v)) {
            return Err("nonfinite score gradient".into());
        }
        Ok(gradient)
    }

    // Check each weight against central differences of the compiled primal row.
    fn verify(&self, optimizer: &Optimizer, actions: usize) -> Result<f64> {
        let batch = Batch {
            features: vec![
                [0.8, -1.2, 0.13, 0.46, -0.98],
                [-0.22, 0.6, 1.4, -0.87, 0.31],
                [0.1, 0.5, -0.3, 0.8, 1.7],
            ],
            perturbations: [
                [0.5, -0.9, 0.3, -0.71],
                [-0.2, -0.5, 1.1, 0.26],
                [0.8, 0.4, -0.6, 1.31],
            ]
            .iter()
            .map(|row| row[..actions].to_vec())
            .collect(),
            advantages: vec![0.74, -1.3, 0.28],
            sigma: 0.37,
        };
        let gradient = self.gradient(&batch, optimizer)?;
        let delta = 1e-5;
        let mut worst = 0_f64;
        let mut p = vec![0.; self.slots];
        p[self.sigma] = batch.sigma;
        for (action, row) in gradient.iter().enumerate() {
            for (weight, &analytic) in row.iter().enumerate() {
                let mut slope = 0.;
                for i in 0..batch.features.len() {
                    p[self.epsilon] = batch.perturbations[i][action];
                    p[self.features..self.features + 5].copy_from_slice(&batch.features[i]);
                    p[self.shift + weight] = delta;
                    let plus = self.row.eval_row_with_context(
                        0,
                        &[0.],
                        &p,
                        0.,
                        RowEvalContext::default(),
                    )?;
                    p[self.shift + weight] = -delta;
                    let minus = self.row.eval_row_with_context(
                        0,
                        &[0.],
                        &p,
                        0.,
                        RowEvalContext::default(),
                    )?;
                    p[self.shift + weight] = 0.;
                    slope += batch.advantages[i] * (plus - minus)
                        / (2. * delta * batch.features.len() as f64);
                }
                worst = worst.max((analytic - slope).abs());
            }
        }
        if worst > 1e-8 {
            return Err(format!("finite differences differ by {worst}").into());
        }
        Ok(worst)
    }
}

fn main() -> Result<()> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let verify = args.first().is_some_and(|s| s == "--verify");
    let model = args
        .get(usize::from(verify))
        .map(PathBuf::from)
        .unwrap_or(std::env::current_exe()?.with_file_name("score.json"));
    let score = Score::load(&model)?;
    let optimizer = Optimizer::load(&model.with_file_name("optimizer.json"))?;
    if verify {
        println!(
            "{}",
            json!({"finiteDifferenceMaxError":score.verify(&optimizer,3)?,"weights":15,"fourActionMaxError":score.verify(&optimizer,4)?,"fourActionWeights":20})
        );
        return Ok(());
    }
    let mut out = io::stdout().lock();
    for line in io::stdin().lock().lines() {
        let line = line?;
        let result = (|| -> Result<Value> {
            let request: Value = serde_json::from_str(&line)?;
            match request["op"].as_str().unwrap_or("gradient") {
                "returns" => optimizer.returns(request),
                "update" => optimizer.update(&score, request),
                "gradient" => Ok(
                    json!({"gradient":score.gradient(&serde_json::from_value(request)?,&optimizer)?}),
                ),
                _ => Err("unknown optimizer operation".into()),
            }
        })();
        let response = match result {
            Ok(response) => response,
            Err(e) => json!({"error":e.to_string()}),
        };
        writeln!(out, "{response}")?;
        out.flush()?;
    }
    Ok(())
}
