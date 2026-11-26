// Same one-query entry point a JS physics worker could call. Setup is untimed.
#![cfg(target_arch = "wasm32")]
use parry3d_f64::{math::Vector, query::PointQuery, shape::TriMesh};
use std::{cell::RefCell, mem};

#[derive(Default)]
struct Fixture {
    vertices: Vec<Vector>,
    triangles: Vec<[u32; 3]>,
    mesh: Option<TriMesh>,
}

thread_local! { static SITE: RefCell<Fixture> = RefCell::default(); }

#[unsafe(no_mangle)]
pub extern "C" fn vertex(x: f64, y: f64, z: f64) {
    SITE.with_borrow_mut(|s| s.vertices.push(Vector::new(x, y, z)));
}

#[unsafe(no_mangle)]
pub extern "C" fn triangle(a: u32, b: u32, c: u32) {
    SITE.with_borrow_mut(|s| s.triangles.push([a, b, c]));
}

#[unsafe(no_mangle)]
pub extern "C" fn build() -> bool {
    SITE.with_borrow_mut(|s| {
        s.mesh = TriMesh::new(mem::take(&mut s.vertices), mem::take(&mut s.triangles)).ok();
        s.mesh.is_some()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn distance(x: f64, y: f64, z: f64, limit: f64) -> f64 {
    let p = Vector::new(x, y, z);
    SITE.with_borrow(|s| {
        s.mesh
            .as_ref()
            .and_then(|mesh| mesh.project_local_point_with_max_dist(p, false, limit))
            .map_or(-1.0, |hit| p.distance(hit.point))
    })
}

use parry3d_f64::{
    math::{Pose, Rotation},
    query::intersection_test,
    shape::SharedShape,
};

#[derive(Default)]
struct Hull {
    parts: Vec<(Vector, SharedShape)>,
    rim: Vec<Vector>,
    reach: f64,
}
thread_local! { static HULL: RefCell<Hull> = RefCell::default(); }

#[unsafe(no_mangle)]
pub extern "C" fn hull_vertex(x: f64, y: f64, z: f64) {
    HULL.with_borrow_mut(|h| h.rim.push(Vector::new(x, y, z)));
}

#[unsafe(no_mangle)]
pub extern "C" fn hull_part(x: f64, y: f64, z: f64, hx: f64, hy: f64, hz: f64) -> bool {
    HULL.with_borrow_mut(|h| {
        let shape = if !h.rim.is_empty() {
            let Some(polyhedron) = SharedShape::convex_hull(&mem::take(&mut h.rim)) else {
                return false;
            };
            polyhedron
        } else if hy == 0.0 {
            SharedShape::ball(hx)
        } else {
            SharedShape::cuboid(hx, hy, hz)
        };
        let offset = Vector::new(x, y, z);
        h.reach = h
            .reach
            .max(offset.length() + Vector::new(hx, hy, hz).length());
        h.parts.push((offset, shape));
        true
    })
}

// Bit i records which individual part penetrates a two-sided scan at this pose.
#[unsafe(no_mangle)]
pub extern "C" fn touching_parts(
    x: f64,
    y: f64,
    z: f64,
    qw: f64,
    qx: f64,
    qy: f64,
    qz: f64,
) -> i32 {
    let body = Pose::from_parts(Vector::new(x, y, z), Rotation::from_xyzw(qx, qy, qz, qw));
    SITE.with_borrow(|s| {
        HULL.with_borrow(|h| {
            let mesh = s.mesh.as_ref().unwrap();
            let bounds = mesh.local_aabb();
            if body
                .translation
                .clamp(bounds.mins, bounds.maxs)
                .distance_squared(body.translation)
                > h.reach * h.reach
            {
                return 0;
            }
            let mut mask = 0;
            for (i, (offset, shape)) in h.parts.iter().enumerate() {
                let pose = Pose::from_parts(body * *offset, body.rotation);
                match intersection_test(&Pose::IDENTITY, mesh, &pose, shape.as_ref()) {
                    Ok(hit) if hit.intersecting => mask |= 1 << i,
                    Ok(_) => (),
                    Err(_) => return -1,
                }
            }
            mask
        })
    })
}
