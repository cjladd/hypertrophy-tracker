"""
make_dummy_onnx.py — generates a throwaway ONNX model for the Phase 1.4 runtime
proof-of-concept (validates onnxruntime-react-native loads + runs on-device).

Model: input float32[1,15] -> output float32[1,1] where output = sum(input).
A real (non-constant) computation so the POC can assert the data actually flowed
through the graph, not just that a session opened.

Run:  python scripts/make_dummy_onnx.py
Out:  assets/models/dummy_progression.onnx

IR version + opset are pinned conservatively to stay within onnxruntime-react-native's
supported range (a common cause of "failed to load model" on device).
"""

import os
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

N_FEATURES = 15
OUT_PATH = os.path.join("assets", "models", "dummy_progression.onnx")

# input[1,15] @ W[15,1] + b[1]  ->  output[1,1]   (W all ones, b zero => row sum)
W = numpy_helper.from_array(np.ones((N_FEATURES, 1), dtype=np.float32), name="W")
b = numpy_helper.from_array(np.zeros((1,), dtype=np.float32), name="b")

inp = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, N_FEATURES])
out = helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 1])

matmul = helper.make_node("MatMul", ["input", "W"], ["mm"])
add = helper.make_node("Add", ["mm", "b"], ["output"])

graph = helper.make_graph(
    [matmul, add], "dummy_progression", [inp], [out], initializer=[W, b]
)

model = helper.make_model(
    graph,
    producer_name="hypertrophy-helper-poc",
    opset_imports=[helper.make_operatorsetid("", 17)],
)
model.ir_version = 10  # stay within onnxruntime-react-native 1.24's supported IR range

onnx.checker.check_model(model)

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
onnx.save(model, OUT_PATH)
print(f"wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)} bytes), ir_version={model.ir_version}")
