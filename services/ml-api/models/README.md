Place trained weights here (not committed):

- `liver_efficientnet_b3_best.pth` — PyTorch checkpoint
- `liver_efficientnet_b3.onnx` — ONNX for inference
- `clinical_baseline.joblib` — sklearn clinical model (NFLD)

Train: `cd training && python train_efficientnet.py`
