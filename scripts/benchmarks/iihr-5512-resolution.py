"""Refine the straight-tow spectral grid independently of its 64 m periodic domain."""

import argparse
import json
from pathlib import Path

import numpy as np


def straight_tow(geometry, probes, period, cells, dt):
    spacing = period / cells
    frequency = 2 * np.pi * np.fft.fftfreq(cells, spacing)
    kx, ky = frequency[None, :], frequency[:, None]
    k = np.hypot(kx, ky)
    source = np.zeros((cells, cells), dtype=complex)
    stations, beams = geometry["stations"], geometry["beamHalf"]
    for i in range(len(stations) - 1):
        volume = geometry["volume"][i]
        length = stations[i + 1] - stations[i]
        width = beams[i + 1] + beams[i]
        draft = volume / (length * width)
        shape = ((kx * length)**2 + (ky * width)**2) / 24
        phase = kx * (stations[i] + stations[i + 1]) / 2
        source += volume / spacing**2 * np.exp(-0.5 * k * draft - shape - 1j * phase)
    source[0, 0] = 0
    source[cells // 2, :] = source[:, cells // 2] = 0
    omega = np.sqrt(9.80665 * k * np.tanh(3 * k))
    propagation = np.exp(-dt * (0.04 * (1 + 0.08 * k**2) + 1j * omega))
    speed = 0.28 * np.sqrt(9.80665 * 3.048)
    q = np.zeros_like(source)
    distance = 0
    totals = np.zeros(len(probes))
    count = 0
    for step in range(1, round(45 / dt) + 1):
        time = step * dt
        delta = speed * min(1, time / 2) * dt
        distance += delta
        # After the two-second ramp each step has the same translating-frame update.
        if time <= 2 + dt:
            shift = np.exp(1j * kx * delta)
            transport = propagation * shift
            forcing = source * (1 - shift)
        q = q * transport + forcing
        if time > 35:
            field = np.fft.ifft2(q * np.exp(-1j * kx * distance)).real
            coords = (probes[:, :2] + [distance, 0]) / spacing
            base = np.floor(coords).astype(int)
            x, y = base.T
            a, b = (coords - base).T
            lower = (1 - a) * field[y % cells, x % cells] + a * field[y % cells, (x + 1) % cells]
            upper = (1 - a) * field[(y + 1) % cells, x % cells] + a * field[(y + 1) % cells, (x + 1) % cells]
            totals += (1 - b) * lower + b * upper
            count += 1
    return totals / count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="combined-field iihr-5512-wake.mjs output directory")
    args = parser.parse_args()
    geometry = json.loads((args.directory / "geometry.json").read_text())
    probes = np.array(json.loads((args.directory / "profile-probes.json").read_text()))
    table = np.genfromtxt(args.directory / "profile-comparison.csv", delimiter=",", names=True)
    base = table[table["period_m"] == 64]
    dt, = np.unique(base["dt_s"])
    measured = base["measurement_m"]
    print("grid_cells,spacing_m,at_measured_crest_mm,peak_mm,peak_x_over_L,profile_rmse_mm")
    for cells in (64, 128, 256, 512):
        far = straight_tow(geometry, probes, 64, cells, dt)
        if cells == 64:
            np.testing.assert_allclose(far, base["prediction_m"], atol=1e-10, rtol=0)
        combined = 1000 * (far + base["near_field_m"])
        rmse = np.sqrt(np.mean((combined - 1000 * measured)**2))
        peak = np.argmax(combined)
        print(f"{cells},{64 / cells},{combined[np.argmax(measured)]:.2f},"
              f"{combined[peak]:.2f},{base['x_from_bow_over_length'][peak]:.5f},{rmse:.2f}")


if __name__ == "__main__":
    main()
