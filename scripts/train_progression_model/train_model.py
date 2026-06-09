"""
train_model.py — train the progression action classifier (Phase 1.2).

Trains an XGBoost 3-class classifier (INCREASE / HOLD / RESET) on the synthetic
bootstrap from generate_synthetic_data.py, with class weights to handle the
realistic HOLD-heavy imbalance (decision: synthetic_data_spec.md §6, Option A).

We train ONLY the classifier — no weight-delta regressor. With the engine's fixed
5 lb increment, weight_delta is deterministic given (action, current_weight):
  INCREASE -> +weight_jump_lb ; HOLD -> 0 ; RESET -> round5(weight*0.9) - weight.
So a regressor would predict a constant; the delta is computed at inference instead.

Evaluation is on macro-F1 / per-class recall vs. the raw rule-engine baseline
(`base_action`), NOT raw accuracy — a HOLD-always model would score ~63%.

Usage:
  python scripts/train_progression_model/train_model.py
  python scripts/train_progression_model/train_model.py --data <csv> --out-model <json>
"""

from __future__ import annotations

import argparse
import csv
import json
import os

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

# Feature order MUST match ProgressionFeatureVector (lib/ai/types.ts) and the order the
# RN Tensor is built in (lib/ai/model-manager.ts). Do not reorder without updating both.
FEATURE_COLS = [
    "current_weight_lb", "top_set_reps", "top_set_rpe", "working_set_count",
    "rep_range_min", "rep_range_max", "weight_jump_lb", "stall_count",
    "progression_ceiling", "prev_weight_lb", "prev_top_reps", "prev_rpe",
    "days_since_last", "volume_trend_4wk", "recovery_score",
]
# Class order — the ONNX output prob vector is indexed in THIS order. RN maps index -> action.
ACTIONS = ["INCREASE", "HOLD", "RESET"]
ACTION_TO_IDX = {a: i for i, a in enumerate(ACTIONS)}


def load(path):
    feats, y, base = [], [], []
    with open(path) as f:
        for r in csv.DictReader(f):
            feats.append([float(r[c]) for c in FEATURE_COLS])
            y.append(ACTION_TO_IDX[r["action"]])
            base.append(ACTION_TO_IDX[r["base_action"]])
    return (np.asarray(feats, dtype=np.float32),
            np.asarray(y, dtype=np.int64),
            np.asarray(base, dtype=np.int64))


def macro_f1(y_true, y_pred):
    return f1_score(y_true, y_pred, average="macro")


def print_confusion(y_true, y_pred, title):
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2])
    print(f"\n  {title} (rows=true, cols=pred)")
    print(f"        {'INC':>6}{'HOLD':>6}{'RESET':>6}")
    for i, a in enumerate(ACTIONS):
        print(f"  {a:6s}" + "".join(f"{cm[i][j]:>6}" for j in range(3)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="scripts/train_progression_model/data/progression_synth.csv")
    ap.add_argument("--out-model", default="scripts/train_progression_model/data/progression_v1.json")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--test-size", type=float, default=0.2)
    args = ap.parse_args()

    X, y, base = load(args.data)
    print(f"loaded {len(y)} rows, {X.shape[1]} features from {args.data}")
    counts = np.bincount(y, minlength=3)
    print("class counts:", {ACTIONS[i]: int(counts[i]) for i in range(3)})

    X_tr, X_te, y_tr, y_te, _, base_te = train_test_split(
        X, y, base, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    # class weights handle the realistic HOLD-heavy imbalance (Option A)
    sw = compute_sample_weight(class_weight="balanced", y=y_tr)

    model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        max_depth=4,
        n_estimators=300,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        eval_metric="mlogloss",
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(X_tr, y_tr, sample_weight=sw)

    y_pred = model.predict(X_te)

    print("\n" + "=" * 64)
    print("MODEL vs RULE-ENGINE BASELINE (held-out test set)")
    print("=" * 64)
    m_f1 = macro_f1(y_te, y_pred)
    b_f1 = macro_f1(y_te, base_te)
    print(f"\n  macro-F1   model {m_f1:.3f}   |   rule-engine baseline {b_f1:.3f}   "
          f"({'+' if m_f1 >= b_f1 else ''}{m_f1 - b_f1:+.3f})")
    print("\n  Per-class report (model):")
    print(classification_report(y_te, y_pred, target_names=ACTIONS, digits=3))
    print_confusion(y_te, y_pred, "MODEL")
    print_confusion(y_te, base_te, "RULE-ENGINE BASELINE")

    print("\n  Feature importance (gain):")
    imp = model.feature_importances_
    for name, val in sorted(zip(FEATURE_COLS, imp), key=lambda kv: -kv[1]):
        bar = "#" * int(round(val * 50))
        print(f"    {name:22s} {val:6.3f} {bar}")

    os.makedirs(os.path.dirname(args.out_model), exist_ok=True)
    model.save_model(args.out_model)
    meta = {
        "feature_order": FEATURE_COLS,
        "class_order": ACTIONS,
        "model_version": "progression_v1",
        "macro_f1": round(float(m_f1), 4),
        "baseline_macro_f1": round(float(b_f1), 4),
    }
    meta_path = args.out_model.replace(".json", "_meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\nsaved model -> {args.out_model}\nsaved meta  -> {meta_path}")
    print("verdict:", "MODEL BEATS BASELINE" if m_f1 > b_f1 else "model does NOT beat baseline")


if __name__ == "__main__":
    main()
