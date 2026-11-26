// The Node harness supplies pre-filtered indexed triangles and two query groups.
use parry3d_f64::{math::Vector, query::PointQuery, shape::TriMesh};
use std::{env, error::Error, fs, hint::black_box, io::Write, str::FromStr, time::Instant};

fn read<T: FromStr>(input: &mut std::str::SplitWhitespace<'_>) -> Result<T, Box<dyn Error>>
where
    T::Err: Error + 'static,
{
    Ok(input.next().ok_or("incomplete query fixture")?.parse()?)
}

fn vector(input: &mut std::str::SplitWhitespace<'_>) -> Result<Vector, Box<dyn Error>> {
    Ok(Vector::new(read(input)?, read(input)?, read(input)?))
}

fn median_ns(points: &[Vector], query: &impl Fn(Vector) -> f64) -> f64 {
    let mut times = Vec::new();
    for round in 0..7 {
        let start = Instant::now();
        let mut sum = 0.0;
        for _ in 0..10 {
            for &point in points {
                sum += query(black_box(point));
            }
        }
        black_box(sum);
        if round >= 2 {
            times.push(start.elapsed().as_secs_f64() * 1e9 / (points.len() * 10) as f64);
        }
    }
    times.sort_by(f64::total_cmp);
    times[times.len() / 2]
}

fn main() -> Result<(), Box<dyn Error>> {
    let path = env::args()
        .nth(1)
        .ok_or("usage: wreck-scan-parry-query FIXTURE")?;
    let text = fs::read_to_string(path)?;
    let mut words = text.split_whitespace();
    let vertices: usize = read(&mut words)?;
    let faces: usize = read(&mut words)?;
    let count: usize = read(&mut words)?;
    let radius: f64 = read(&mut words)?;
    if count == 0 || !count.is_multiple_of(2) || !radius.is_finite() || radius <= 0.0 {
        return Err("expected two equal, nonempty groups and a positive radius".into());
    }
    let vertices = (0..vertices)
        .map(|_| vector(&mut words))
        .collect::<Result<Vec<_>, _>>()?;
    let mut indices = Vec::with_capacity(faces);
    for _ in 0..faces {
        indices.push([read(&mut words)?, read(&mut words)?, read(&mut words)?]);
    }
    let mesh = TriMesh::new(vertices, indices)?;
    let points = (0..count)
        .map(|_| vector(&mut words))
        .collect::<Result<Vec<_>, _>>()?;
    if words.next().is_some() {
        return Err("extra values at end of fixture".into());
    }
    let query = |point: Vector| {
        mesh.project_local_point_with_max_dist(point, false, radius)
            .map_or(-1.0, |hit| point.distance(hit.point))
    };
    for group in points.chunks_exact(count / 2) {
        eprintln!("{}", median_ns(group, &query));
    }
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    for point in points {
        writeln!(out, "{:.17e}", query(point))?;
    }
    Ok(())
}
