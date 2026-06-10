"""
export_recovery_model.py — convert the trained recovery regressor to ONNX (Phase 4.1).

Loads recovery_v1.json (train_recovery_model.py) and writes
assets/models/recovery_v1.onnx for the on-device loader (lib/ai/model-manager.ts).
IR/opset pinned conservatively for onnxruntime-react-native (same caution as progression_v1).

Usage:
  python scripts/train_recovery_model/export_recovery_model.py
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import onnx
import onnxmltools
from onnxmltools.convert.common.data_types import FloatTensorType
from xgboost import XGBRegressor

N_FEATURES = 12


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-model", default="scripts/train_recovery_model/data/recovery_v1.json")
    ap.add_argument("--out", default="assets/models/recovery_v1.onnx")
    ap.add_argument("--opset", type=int, default=15)
    args = ap.parse_args()

    model = XGBRegressor()
    model.load_model(args.in_model)

    onnx_model = onnxmltools.convert_xgboost(
        model,
        initial_types=[("input", FloatTensorType([None, N_FEATURES]))],
        target_opset=args.opset,
    )
    onnx_model.ir_version = 10

    onnx.checker.check_model(onnx_model)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    onnxmltools.utils.save_model(onnx_model, args.out)
    print(f"wrote {args.out} ({os.path.getsize(args.out)} bytes), ir_version={onnx_model.ir_version}")
    print("outputs:", [o.name for o in onnx_model.graph.output])

    try:
        import onnxruntime as rt
        sess = rt.InferenceSession(args.out, providers=["CPUExecutionProvider"])
        # a "fresh / well-rested" sample -> expect a high score
        x = np.array([[6, 12, 7.0, 8.0, 2, 4, 0.1, 70, 58, 8.0, -1.0, 1]], dtype=np.float32)
        out = sess.run(None, {sess.get_inputs()[0].name: x})
        print("self-check OK — input:", sess.get_inputs()[0].name,
              "| output:", [o.name for o in sess.get_outputs()],
              "| value:", float(np.asarray(out[0]).ravel()[0]))
    except Exception as e:  # noqa: BLE001
        print("self-check skipped/failed:", e)


if __name__ == "__main__":
    main()
