"""
train_recovery_model.py — train the recovery readiness regressor (Phase 4.1).

XGBoost regressor: 12-dim RecoveryFeatureVector -> recovery score 0-100.
Evaluated by MAE / RMSE / R^2 on a held-out split vs. the pure-heuristic baseline
(`heuristic_score`). The model should beat the heuristic by capturing the non-linear
interactions injected into the labels (generate_recovery_data.py).

Usage:
  python scripts/train_recovery_model/train_recovery_model.py
"""

from __future__ import annotations

import argparse
import csv
import json
import os

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

FEATURE_COLS = [
    "total_sets_7d", "total_sets_14d", "avg_rpe_7d", "max_rpe_7d", "sessions_7d",
    "days_since_last_session", "stall_ratio", "hrv_latest", "resting_hr_latest",
    "sleep_hours_avg_7d", "volume_trend_4wk", "has_health_data",
]


def load(path):
    X, y, heur = [], [], []
    with open(path) as f:
        for r in csv.DictReader(f):
            X.append([float(r[c]) for c in FEATURE_COLS])
            y.append(float(r["recovery_score"]))
            heur.append(float(r["heuristic_score"]))
    return (np.asarray(X, dtype=np.float32),
            np.asarray(y, dtype=np.float32),
            np.asarray(heur, dtype=np.float32))


def rmse(a, b):
    return float(np.sqrt(mean_squared_error(a, b)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="scripts/train_recovery_model/data/recovery_synth.csv")
    ap.add_argument("--out-model", default="scripts/train_recovery_model/data/recovery_v1.json")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--test-size", type=float, default=0.2)
    args = ap.parse_args()

    X, y, heur = load(args.data)
    print(f"loaded {len(y)} rows, {X.shape[1]} features from {args.data}")

    X_tr, X_te, y_tr, y_te, _, heur_te = train_test_split(
        X, y, heur, test_size=args.test_size, random_state=args.seed
    )

    model = XGBRegressor(
        objective="reg:squarederror",
        max_depth=4,
        n_estimators=120,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(X_tr, y_tr)
    pred = np.clip(model.predict(X_te), 0, 100)

    print("\n" + "=" * 60)
    print("RECOVERY MODEL vs HEURISTIC BASELINE (held-out test set)")
    print("=" * 60)
    m_mae, m_rmse, m_r2 = mean_absolute_error(y_te, pred), rmse(y_te, pred), r2_score(y_te, pred)
    b_mae, b_rmse, b_r2 = mean_absolute_error(y_te, heur_te), rmse(y_te, heur_te), r2_score(y_te, heur_te)
    print(f"\n  {'':10}{'MAE':>8}{'RMSE':>8}{'R^2':>8}")
    print(f"  {'model':10}{m_mae:>8.2f}{m_rmse:>8.2f}{m_r2:>8.3f}")
    print(f"  {'heuristic':10}{b_mae:>8.2f}{b_rmse:>8.2f}{b_r2:>8.3f}")
    print(f"\n  MAE improvement over heuristic: {b_mae - m_mae:+.2f} points")

    print("\n  Feature importance (gain):")
    for name, val in sorted(zip(FEATURE_COLS, model.feature_importances_), key=lambda kv: -kv[1]):
        print(f"    {name:26s} {val:6.3f} {'#' * int(round(val * 50))}")

    os.makedirs(os.path.dirname(args.out_model), exist_ok=True)
    model.save_model(args.out_model)
    meta = {
        "feature_order": FEATURE_COLS,
        "model_version": "recovery_v1",
        "mae": round(float(m_mae), 3),
        "heuristic_mae": round(float(b_mae), 3),
        "r2": round(float(m_r2), 4),
    }
    with open(args.out_model.replace(".json", "_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\nsaved model -> {args.out_model}")
    print("verdict:", "MODEL BEATS HEURISTIC" if m_mae < b_mae else "model does NOT beat heuristic")


if __name__ == "__main__":
    main()
