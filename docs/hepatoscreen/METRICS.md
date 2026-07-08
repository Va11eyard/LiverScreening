# Training metrics — real datasets (Zenodo + Mendeley NFLD)

Patient-level split: **637 images**, **141 patients** (train 98 / val 21 / test 22 patients).

## Datasets

| Source | Images | Task | License |
|--------|--------|------|---------|
| Zenodo Byra (1009146) | 550 / 55 patients | Steatosis 0/1, biopsy-proven | CC BY |
| Mendeley NFLD (6rg4hk6728) | 87 / 86 patients | NAFLD + clinical tabular | CC BY 4.0 |

## Vision test split (EfficientNet-B3, binary, 300×300)

| Metric | Value |
|--------|-------|
| balanced_accuracy | 0.668 |
| weighted_f1 | 0.757 |
| test_n | 104 images |

## Multimodal comparison (test split)

| Mode | bal_acc | AUC | Notes |
|------|---------|-----|-------|
| image_only | 0.668 | 0.703 | all sources |
| clinical_only | 0.490 | 0.506 | NFLD rows only have labs |
| fusion 0.7/0.3 | 0.518 | 0.646 | Zenodo rows = vision-only in practice |

**By source (test):**

| Source | image_only AUC | clinical_only AUC | fusion AUC |
|--------|----------------|-------------------|------------|
| mendeley_nfld (n=14) | 0.909 | 0.682 | 0.758 |
| zenodo (n=90) | 0.685 | n/a | 0.685 |

Clinical baseline val AUC (NFLD train): **0.909**

Full reports: `services/ml-api/docs/metrics/eval_report.txt`, `multimodal_eval.json`

## Hardware

- GPU: NVIDIA GeForce RTX 5050 Laptop GPU
- PyTorch cu128, AMP

Weights (local, gitignored): `liver_efficientnet_b3_best.pth`, `liver_efficientnet_b3.onnx`, `clinical_baseline.joblib`
