# HepatoScreen — Pitch Deck (Hackathon)

> Source: `docs/hepatoscreen/PITCH.md` + live metrics from training eval.

---

## Slide 1 — Title

**HepatoScreen**  
ИИ-скрининг патологий печени и ХВГ для ПМСП Казахстана

- Прототип хакатона | 3 контура: клиника + ML Lab + ML API
- GitHub: https://github.com/Va11eyard/LiverScreening
- Demo: http://localhost:3004 (клиника) · http://localhost:3005 (ML Lab)

---

## Slide 2 — Problem

- NAFLD/HBV: поздняя диагностика в ПМСП
- FIB-4/APRI не считаются на приёме
- УЗИ без структурированного триажа и second opinion

**Gap:** нет fusion клиника + УЗИ + explainability на первичке.

---

## Slide 3 — Solution

| Контур | Роль |
|--------|------|
| **HepatoScreen** (:3004) | Кейсы, регистр, экспорт датасета |
| **ML Lab** (:3005) | Загрузка УЗИ, тест модели, overlay |
| **ML API** (:8000) | FIB-4/APRI + EfficientNet-B3 inference |

Fusion: clinical **0.7** + vision **0.3** → `low` / `watch` / `urgent` / `refer_hepatology`

---

## Slide 4 — Live Demo (3 min)

1. Врач создаёт кейс (клиника + УЗИ)
2. ML Lab: drag-drop снимка → карточки результата + explain overlay
3. Сравнение врач vs ИИ в регистре

---

## Slide 5 — Our AI

- **Clinical:** FIB-4, APRI, HBV-aware пороги
- **Vision:** EfficientNet-B3, 300×300, binary steatosis/NAFLD
- **Explainability:** reasoning bullets + SVG region on US
- **Training:** Zenodo Byra (biopsy-proven) + Mendeley NFLD (CC BY 4.0), patient-level split, RTX 5050 AMP

Target metrics: AUC ≥ 0.85 · sensitivity ≥ 85% (steatosis+)

**Eval (test, patient-level):** vision AUC **0.70** · NFLD subset image AUC **0.91** · Zenodo external AUC **0.68**

---

## Slide 6 — Architecture

```
Clinical :3004 → Go API :8088 → PostgreSQL
                    ↓
              ML API :8000 ← ML Lab :3005
```

Docker: postgres + ml-api + api | Frontends: `pnpm dev`

---

## Slide 7 — Roadmap

| Phase | Deliverable |
|-------|-------------|
| Hackathon | Working prototype + real-data metrics + pitch |
| +2 weeks | Pilot export from ПМСП cases |
| +1 month | Pilot 1 ПМСП, 500 cases |
| +3 months | Grad-CAM v2, regulatory path |

---

## Slide 8 — Ask

- Пилот в 1 ПМСП Астаны
- Партнёрство с гепатологическим центром
- Feedback жюри по клиническим порогам для KZ

**Контакт:** coordinator@liver.kz (demo seed)

---

## FAQ (backup)

- **Медизделие?** Нет — CDS прототип, не заменяет врача
- **Данные?** Открытые датасеты + platform export, PHI не в git
- **GPU?** RTX 5050, PyTorch cu128
