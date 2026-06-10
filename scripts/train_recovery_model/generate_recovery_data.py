"""
generate_recovery_data.py — bootstrap synthetic training data for the recovery model (Phase 4.1).

Per-muscle-group 12-dim RecoveryFeatureVector -> recovery score 0-100.

Validity framing (be honest):
  - The LABEL base is the app's exact heuristic (ported from lib/ai/features.ts
    computeHeuristicRecoveryScore). A model trained on heuristic(x) alone can only
    IMITATE the heuristic, never beat it.
  - To give the model a reason to exist, the label adds modest, physiologically-motivated
    NON-LINEAR INTERACTIONS the additive heuristic can't represent (volume x poor-sleep,
    high-RPE x low-HRV, deload supercompensation), plus per-individual noise.
  - The pure heuristic is emitted as `heuristic_score` -> the baseline the model must beat.
  - Real validity still only arrives with personalization on real HRV/HR/sleep + outcomes.
    Set INTERACTIONS_ENABLED=False for pure-imitation.

Usage:
  python scripts/train_recovery_model/generate_recovery_data.py --rows 10000 --report
"""

from __future__ import annotations

import argparse
import csv
import os
from statistics import mean

import numpy as np

INTERACTIONS_ENABLED = True
NOISE_SD = 4.0  # per-individual variation on the label

# RecoveryFeatureVector field order (lib/ai/types.ts) — MUST match the trainer + RN tensor.
FEATURE_COLS = [
    "total_sets_7d", "total_sets_14d", "avg_rpe_7d", "max_rpe_7d", "sessions_7d",
    "days_since_last_session", "stall_ratio", "hrv_latest", "resting_hr_latest",
    "sleep_hours_avg_7d", "volume_trend_4wk", "has_health_data",
]

# Health baselines (must match features.ts)
HRV_BASELINE = 65.0
HR_BASELINE = 65.0


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


# =============================================================================
# EXACT port of computeHeuristicRecoveryScore (lib/ai/features.ts) — the label base
# and the baseline the model is measured against. Keep in lockstep with the TS.
# =============================================================================
def heuristic_recovery_score(v: dict) -> int:
    score = 100.0

    if v["total_sets_7d"] > 20: score -= 30
    elif v["total_sets_7d"] > 15: score -= 20
    elif v["total_sets_7d"] > 10: score -= 10
    elif v["total_sets_7d"] > 5: score -= 4

    if v["avg_rpe_7d"] > 9.0: score -= 20
    elif v["avg_rpe_7d"] > 8.5: score -= 12
    elif v["avg_rpe_7d"] > 8.0: score -= 6
    elif v["avg_rpe_7d"] > 7.5: score -= 2

    if v["days_since_last_session"] >= 5: score += 15
    elif v["days_since_last_session"] >= 3: score += 8
    elif v["days_since_last_session"] >= 2: score += 3
    elif v["days_since_last_session"] < 1: score -= 10

    if v["stall_ratio"] > 0.6: score -= 15
    elif v["stall_ratio"] > 0.4: score -= 8
    elif v["stall_ratio"] > 0.2: score -= 3

    if v["volume_trend_4wk"] > 3: score -= 10
    elif v["volume_trend_4wk"] > 1.5: score -= 5
    elif v["volume_trend_4wk"] < -1: score += 5

    if v["has_health_data"]:
        if v["hrv_latest"] > 0:
            r = v["hrv_latest"] / HRV_BASELINE
            if r < 0.7: score -= 12
            elif r < 0.85: score -= 6
            elif r > 1.2: score += 5
        if v["resting_hr_latest"] > 0:
            r = v["resting_hr_latest"] / HR_BASELINE
            if r > 1.15: score -= 8
            elif r > 1.07: score -= 4
            elif r < 0.92: score += 3
        if v["sleep_hours_avg_7d"] > 0:
            if v["sleep_hours_avg_7d"] < 5.5: score -= 15
            elif v["sleep_hours_avg_7d"] < 6.5: score -= 8
            elif v["sleep_hours_avg_7d"] < 7.0: score -= 3
            elif v["sleep_hours_avg_7d"] >= 8.0: score += 5

    return int(round(clamp(score, 0, 100)))


# =============================================================================
# Non-linear interactions the additive heuristic cannot capture (the model's edge).
# Physiologically motivated, deliberately modest.
# =============================================================================
def interaction_adjustment(v: dict) -> float:
    if not INTERACTIONS_ENABLED:
        return 0.0
    adj = 0.0
    high_vol = v["total_sets_7d"] > 15
    # 1) High volume compounded by poor sleep — fatigue super-additive
    if v["has_health_data"] and high_vol and 0 < v["sleep_hours_avg_7d"] < 6.5:
        adj -= 8
    # 2) High effort with suppressed HRV — systemic fatigue
    if v["has_health_data"] and v["avg_rpe_7d"] > 8.5 and 0 < v["hrv_latest"] < 0.8 * HRV_BASELINE:
        adj -= 6
    # 3) Deload supercompensation — ample rest AND tapering volume
    if v["days_since_last_session"] >= 4 and v["volume_trend_4wk"] < -0.5:
        adj += 6
    # 4) Grind state — high stall AND high RPE (digging a hole)
    if v["stall_ratio"] > 0.5 and v["avg_rpe_7d"] > 8.5:
        adj -= 5
    return adj


# =============================================================================
# Realistic correlated feature generation (avoid impossible feature combos)
# =============================================================================
def make_feature_vector() -> dict:
    # latent weekly training load drives volume, RPE, sessions coherently
    load = np.random.beta(2, 2)  # 0..1, centered ~0.5

    sessions_7d = int(clamp(round(np.random.normal(2 + load * 4, 1)), 0, 7))
    sets_per_session = np.random.normal(3 + load * 2.5, 1)
    total_sets_7d = clamp(round(sessions_7d * max(0.0, sets_per_session)), 0, 35)
    total_sets_14d = clamp(round(total_sets_7d * np.random.uniform(1.5, 2.2)), total_sets_7d, 70)

    avg_rpe_7d = clamp(np.random.normal(6.8 + load * 2.2, 0.4), 5.5, 10.0) if sessions_7d > 0 else 0.0
    max_rpe_7d = clamp(avg_rpe_7d + np.random.uniform(0.3, 1.5), 0.0, 10.0) if sessions_7d > 0 else 0.0

    # more sessions -> fewer days since last (with a long-rest tail)
    if np.random.random() < 0.15:
        days_since = int(clamp(round(np.random.uniform(4, 12)), 0, 14))  # rest / layoff
    else:
        days_since = int(clamp(round(np.random.normal(3 - load * 1.5, 1.2)), 0, 10))

    stall_ratio = clamp(np.random.beta(1.5, 4) + load * 0.15, 0.0, 1.0)
    volume_trend = clamp(np.random.normal((load - 0.5) * 5, 1.5), -4.0, 6.0)

    has_health = 1 if np.random.random() < 0.5 else 0  # 50% (graceful degradation, spec §4.1)
    if has_health:
        # health metrics weakly anti-/co-vary with load
        hrv = clamp(np.random.normal(HRV_BASELINE * (1.1 - load * 0.3), 12), 20, 120)
        rhr = clamp(np.random.normal(58 + load * 10, 6), 40, 95)
        sleep = clamp(np.random.normal(7.2 - load * 0.6, 1.0), 3.5, 9.5)
    else:
        hrv = rhr = sleep = 0.0

    return {
        "total_sets_7d": int(total_sets_7d),
        "total_sets_14d": int(total_sets_14d),
        "avg_rpe_7d": round(avg_rpe_7d, 2),
        "max_rpe_7d": round(max_rpe_7d, 2),
        "sessions_7d": sessions_7d,
        "days_since_last_session": days_since,
        "stall_ratio": round(stall_ratio, 3),
        "hrv_latest": round(hrv, 1),
        "resting_hr_latest": round(rhr, 1),
        "sleep_hours_avg_7d": round(sleep, 2),
        "volume_trend_4wk": round(volume_trend, 3),
        "has_health_data": has_health,
    }


def make_row() -> dict:
    v = make_feature_vector()
    base = heuristic_recovery_score(v)
    label = clamp(base + interaction_adjustment(v) + np.random.normal(0, NOISE_SD), 0, 100)
    v["recovery_score"] = round(label, 1)   # regression target
    v["heuristic_score"] = base             # baseline the model must beat
    return v


# =============================================================================
# Report (spec §7 analogue)
# =============================================================================
def print_report(rows):
    n = len(rows)
    print(f"\n{'='*66}\nRECOVERY DATA REPORT — {n} rows\n{'='*66}")

    labels = [r["recovery_score"] for r in rows]
    heur = [r["heuristic_score"] for r in rows]
    print(f"\n[1] recovery_score (label): min {min(labels):.1f} / mean {mean(labels):.1f} / max {max(labels):.1f}")
    buckets = [0] * 5
    for s in labels:
        buckets[min(4, int(s // 20))] += 1
    for i, c in enumerate(buckets):
        print(f"    {i*20:3d}-{i*20+19:3d}: {c:6d}  {'#' * int(50 * c / n)}")

    diffs = [abs(r["recovery_score"] - r["heuristic_score"]) for r in rows]
    print(f"\n[2] |label - heuristic| (interaction+noise gap): mean {mean(diffs):.2f}, max {max(diffs):.1f}")
    print(f"    health data present: {100*sum(r['has_health_data'] for r in rows)/n:.0f}% of rows")

    print("\n[3] Feature distributions (min / mean / max):")
    for c in FEATURE_COLS:
        vals = [float(r[c]) for r in rows]
        print(f"    {c:26s} {min(vals):7.2f} / {mean(vals):7.2f} / {max(vals):7.2f}")
    print(f"{'='*66}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=10000)
    ap.add_argument("--out", default="scripts/train_recovery_model/data/recovery_synth.csv")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    np.random.seed(args.seed)
    rows = [make_row() for _ in range(args.rows)]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    cols = FEATURE_COLS + ["recovery_score", "heuristic_score"]
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {args.out}")

    if args.report:
        print_report(rows)


if __name__ == "__main__":
    main()
