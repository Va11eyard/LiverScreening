# HepatoScreen — Architecture Decisions (source of truth)

> Resolves conflicts from VALIDATION_REPORT.md. Implementation follows these values.

## Vision model

| Decision | Value |
|----------|-------|
| Primary | **EfficientNet-B3** (`timm`, `efficientnet_b3`) |
| Fallback (OOM) | EfficientNet-B0 |
| Input size | **300×300** RGB (grayscale US duplicated to 3 channels) |

## Fusion (clinical + vision)

| Component | Weight |
|-----------|--------|
| Clinical (FIB-4 + APRI + AST/ALT) | **0.70** |
| Vision (US model confidence) | **0.30** |

Hard safety rules override ensemble (FIB-4 ≥ 3.25 → `refer_hepatology`, etc.).

## Risk tier enum

Canonical values (code + UI + API):

- `low`
- `watch`
- `urgent`
- `refer_hepatology`

UI mapping: low→green, watch→amber, urgent→orange, refer_hepatology→red.

## Phase naming

- **AI_STRATEGY.md** — strategic phases (weeks)
- **AI_BUILD_PLAN.md** — implementation steps 0–5 (hours)

## Metrics targets (pitch)

- AUC-ROC (steatosis S≥1): ≥ **0.85**
- Sensitivity @ specificity 80%: ≥ **0.75** (F≥2), ≥ **0.85** (F3–F4)
- End-to-end latency: < **2.5s** (upload + inference + explainability)
- Vision forward only: ~**75ms** on RTX 5050

## Related docs

See sibling files in `docs/hepatoscreen/` (from Kimi Agent Swarm).
