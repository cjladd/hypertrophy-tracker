"""
export_to_onnx.py — convert the trained XGBoost classifier to ONNX (Phase 1.2).

Loads progression_v1.json (from train_model.py), converts to ONNX via onnxmltools,
and writes assets/models/progression_v1.onnx — which the on-device loader
(lib/ai/model-manager.ts) consumes through the runtime we validated in Phase 1.4.

IR version / opset are pinned conservatively for onnxruntime-react-native (the same
caution that made the dummy POC model load). Note: this model uses the
TreeEnsembleClassifier op (ai.onnx.ml), unlike the MatMul/Add dummy — so the first
on-device run is the real test that ORT-RN supports the ML op domain.

Usage:
  python scripts/train_progression_model/export_to_onnx.py
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import onnx
import onnxmltools
from onnxmltools.convert.common.data_types import FloatTensorType
from xgboost import XGBClassifier

N_FEATURES = 15


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-model", default="scripts/train_progression_model/data/progression_v1.json")
    ap.add_argument("--out", default="assets/models/progression_v1.onnx")
    ap.add_argument("--opset", type=int, default=15)  # onnxmltools/onnx cap; well within ORT-RN support
    args = ap.parse_args()

    model = XGBClassifier()
    model.load_model(args.in_model)

    # input name "input" — the RN loader reads session.inputNames[0] dynamically, so the
    # exact name is flexible, but keep it stable for clarity.
    onnx_model = onnxmltools.convert_xgboost(
        model,
        initial_types=[("input", FloatTensorType([None, N_FEATURES]))],
        target_opset=args.opset,
    )
    onnx_model.ir_version = 10  # stay within onnxruntime-react-native 1.24's supported IR range

    onnx.checker.check_model(onnx_model)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    onnxmltools.utils.save_model(onnx_model, args.out)
    size = os.path.getsize(args.out)
    print(f"wrote {args.out} ({size} bytes), ir_version={onnx_model.ir_version}")
    print("outputs:", [o.name for o in onnx_model.graph.output])

    # --- self-check: load in real ONNX Runtime and run one inference ---
    try:
        import onnxruntime as rt
        sess = rt.InferenceSession(args.out, providers=["CPUExecutionProvider"])
        x = np.zeros((1, N_FEATURES), dtype=np.float32)
        outs = sess.run(None, {sess.get_inputs()[0].name: x})
        names = [o.name for o in sess.get_outputs()]
        print("self-check OK — input:", sess.get_inputs()[0].name, "| outputs:", names)
        for n, o in zip(names, outs):
            print(f"    {n}: {np.asarray(o).ravel()[:3]} ...")
    except Exception as e:  # noqa: BLE001
        print("self-check skipped/failed:", e)


if __name__ == "__main__":
    main()
