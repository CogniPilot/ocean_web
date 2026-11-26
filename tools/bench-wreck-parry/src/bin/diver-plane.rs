// Same posed meshes and translations as the MuJoCo and Coal comparators.
use parry3d_f64::{
    math::{Pose, Vector},
    query::contact,
    shape::{ConvexPolyhedron, HalfSpace},
};
use std::{env, error::Error, fs, hint::black_box, time::Instant};

fn main() -> Result<(), Box<dyn Error>> {
    let input = fs::read_to_string(env::args().nth(1).ok_or("expected a fixture path")?)?;
    let mut fields = input.split_whitespace();
    let mut next = || fields.next().ok_or("incomplete fixture");
    let pose_count: usize = next()?.parse()?;
    let query_count: usize = next()?.parse()?;
    let mut hulls = Vec::with_capacity(pose_count);
    for _ in 0..pose_count {
        let vertex_count: usize = next()?.parse()?;
        let mut vertices = Vec::with_capacity(vertex_count);
        for _ in 0..vertex_count {
            vertices.push(Vector::new(
                next()?.parse()?,
                next()?.parse()?,
                next()?.parse()?,
            ));
        }
        hulls.push(
            ConvexPolyhedron::from_convex_hull(&vertices).ok_or("degenerate collision skin")?,
        );
    }
    let mut queries = Vec::with_capacity(query_count);
    for _ in 0..query_count {
        queries.push((
            next()?.parse::<usize>()?,
            Pose::translation(0.0, 0.0, next()?.parse()?),
        ));
    }
    let floor = HalfSpace::new(Vector::Z);
    let gap = |&(index, translation): &(usize, Pose)| {
        contact(&Pose::IDENTITY, &floor, &translation, &hulls[index], 2.0)
            .expect("halfspace/convex pair")
            .expect("fixture fits prediction distance")
            .dist
    };
    let mut times = Vec::new();
    for pass in 0..9 {
        let start = Instant::now();
        let mut sum = 0.0;
        for _ in 0..128 {
            for query in &queries {
                sum += gap(black_box(query));
            }
        }
        black_box(sum);
        if pass >= 2 {
            times.push(start.elapsed().as_secs_f64() * 1e9 / (128 * query_count) as f64);
        }
    }
    times.sort_by(f64::total_cmp);
    eprintln!("{}", times[times.len() / 2]);
    for q in &queries {
        println!("{:.16e}", gap(q));
    }
    Ok(())
}
