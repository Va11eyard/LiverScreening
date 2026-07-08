# HepatoScreen — System Architecture

> **Document version:** 1.0  
> **Repository:** https://github.com/Va11eyard/LiverScreening  
> **Language:** RU / EN technical terms  
> **Purpose:** Architecture decision record & deployment reference for a prototype AI screening platform for liver pathology and viral hepatitis (HBV/HCV) in Kazakhstan PHC (ПМСП).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Overall Architecture](#2-overall-architecture)
3. [Data Flow Scenarios](#3-data-flow-scenarios)
4. [Auth & Security](#4-auth--security)
5. [Docker Configuration](#5-docker-configuration)
6. [OpenAPI / API Contracts](#6-openapi--api-contracts)
7. [Database Schema](#7-database-schema)
8. [Appendix: Ports & Environment Variables](#8-appendix-ports--environment-variables)

---

## 1. Executive Summary

HepatoScreen is a **3-contour** prototype system:

| Contour | Stack | Port | Auth |
|---------|-------|------|------|
| **Clinical Platform** (`apps/web`) | Next.js 15 + React + TypeScript + Tailwind + shadcn/ui | `:3004` (dev) | NextAuth.js → Go API JWT |
| **ML Lab** (`apps/ml-lab`) | Vite + React + TypeScript (plain CSS) | `:3005` | None (open) |
| **ML API** (`services/ml-api`) | FastAPI + uvicorn | `:8000` | None (open) |
| **Backend API** (`cmd/api/`) | Go + Gin + PostgreSQL | `:8088` | Bearer JWT |
| **Database** | PostgreSQL 16 | `:5432` | Internal only |

The system follows a **clinical-decision-support** pattern: a physician uploads ultrasound images and clinical data, the ML model performs inference, and the results are stored in the case record for coordinator review.

---

## 2. Overall Architecture

### 2.1 System Contours (C4 Container Level)

```mermaid
graph TB
    subgraph "Contour 1: Clinical Platform"
        WEB["apps/web<br/>Next.js 15 + React + TS<br/>Port :3004"]
        NA["NextAuth.js<br/>(proxy auth)"]
        WEB --> NA
    end

    subgraph "Contour 2: ML Lab"
        MLAB["apps/ml-lab<br/>Vite + React + TS<br/>Port :3005"]
    end

    subgraph "Contour 3: ML API"
        MLAPI["services/ml-api<br/>FastAPI + uvicorn<br/>Port :8000"]
        MODEL["ML Model<br/>(ONNX / PyTorch)"]
        MLAPI --> MODEL
    end

    subgraph "Backend"
        GOAPI["cmd/api/<br/>Go + Gin + PostgreSQL<br/>Port :8088"]
        PG[("PostgreSQL<br/>Port :5432")]
        FS["Filesystem<br/>Image Storage"]
        GOAPI --> PG
        GOAPI --> FS
    end

    subgraph "External"
        USER["Physician /<br/>Coordinator"]
        MLUSER["ML Engineer /<br/>Researcher"]
    end

    USER -->|"HTTPS / HTTP"| WEB
    MLUSER -->|"HTTP"| MLAB

    WEB -->|"/api/proxy/*"| GOAPI
    NA -->|"POST /api/v1/auth/login"| GOAPI

    MLAB -->|"POST /inference<br/>POST /triage/clinical"| MLAPI
    GOAPI -->|"POST /inference"| MLAPI

    MLAPI -->|"GET /health"| MLAPI

    style WEB fill:#e1f5fe
    style MLAB fill:#f3e5f5
    style MLAPI fill:#e8f5e9
    style GOAPI fill:#fff3e0
    style PG fill:#fce4ec
    style FS fill:#fce4ec
```

### 2.2 Component Breakdown

#### Clinical Platform (`apps/web`)

```mermaid
graph LR
    subgraph "Next.js App Router"
        LOGIN["/login<br/>page.tsx"]
        DASH["/dashboard<br/>page.tsx"]
        CASE["/cases/[id]<br/>page.tsx"]
        NEW["/cases/new<br/>page.tsx"]
        SURVEY["/survey<br/>page.tsx"]
    end

    subgraph "Components"
        SHELL["app-shell"]
        SB["sidebar"]
        UP["case-image-upload"]
        PREV["case-image-preview"]
        KPI["KPI cards"]
    end

    subgraph "API Layer"
        PROXY["/api/proxy/*<br/>→ Go API :8088"]
        AUTH_PROXY["NextAuth.js<br/>→ /api/v1/auth/login"]
    end

    DASH --> SHELL
    DASH --> SB
    DASH --> KPI
    CASE --> UP
    CASE --> PREV
    NEW --> UP

    style LOGIN fill:#e1f5fe
    style DASH fill:#e1f5fe
    style CASE fill:#e1f5fe
    style NEW fill:#e1f5fe
    style SURVEY fill:#e1f5fe
```

**Key libraries:**

| Library | Purpose |
|---------|---------|
| `next-auth` | Authentication proxy |
| `zod` | Schema validation |
| `react-hook-form` | Form state management |
| `date-fns` | Date formatting |
| `recharts` | Analytics charts |
| `@radix-ui/*` (via shadcn/ui) | Accessible UI primitives |
| `tailwindcss` | Utility-first CSS |

#### ML Lab (`apps/ml-lab`)

```mermaid
graph LR
    subgraph "ML Lab App"
        TAB1["Tab: УЗИ + клиника"]
        TAB2["Tab: Только FIB-4/APRI"]
    end

    subgraph "Components"
        EXPLAIN["ExplainOverlay<br/>SVG overlay + popup"]
    end

    subgraph "API"
        MLAPI_DIRECT["VITE_ML_API_URL<br/>→ :8000"]
    end

    TAB1 --> EXPLAIN
    TAB1 --> MLAPI_DIRECT
    TAB2 --> MLAPI_DIRECT

    style TAB1 fill:#f3e5f5
    style TAB2 fill:#f3e5f5
```

**Key characteristics:**
- No authentication layer
- No shadcn/ui — hand-written components with plain CSS
- Direct API calls to ML API (`:8000`) via `VITE_ML_API_URL`
- Built with Vite (not Next.js)

#### Backend API (`cmd/api/`)

```mermaid
graph TB
    subgraph "Go API (:8088)"
        GIN["Gin Router"]

        subgraph "Middleware Stack"
            CORS["cors()"]
            RL["rateLimit()<br/>— login<br/>— refresh<br/>— api"]
            AUTH["auth()<br/>(Bearer JWT)"]
            AUDIT["auditLog()"]
        end

        subgraph "Route Groups"
            AUTH_ROUTES["/api/v1/auth/*"]
            CASE_ROUTES["/api/v1/cases/*"]
            SURVEY_ROUTES["/api/v1/surveys"]
            REPORT_ROUTES["/api/v1/reports/*"]
        end

        subgraph "Storage"
            PG[(PostgreSQL)]
            FS["Filesystem"]
        end
    end

    GIN --> CORS --> RL --> AUTH --> AUDIT
    AUDIT --> AUTH_ROUTES
    AUDIT --> CASE_ROUTES
    AUDIT --> SURVEY_ROUTES
    AUDIT --> REPORT_ROUTES

    CASE_ROUTES --> PG
    CASE_ROUTES --> FS
    REPORT_ROUTES --> PG

    style GIN fill:#fff3e0
    style CORS fill:#ffccbc
    style RL fill:#ffccbc
    style AUTH fill:#ffccbc
    style AUDIT fill:#ffccbc
```

**Middleware execution order:**
```
Request → CORS → Rate Limiting → Auth (Bearer JWT) → Audit Log → Handler
```

#### ML API (`services/ml-api/`)

```mermaid
graph LR
    subgraph "ML API (:8000)"
        FAST["FastAPI"]
        HEALTH["GET /health"]
        TRIAGE["POST /triage/clinical"]
        INF["POST /inference"]
    end

    subgraph "Model"
        M["ML Model<br/>triage / segmentation"]
    end

    FAST --> HEALTH
    FAST --> TRIAGE --> M
    FAST --> INF --> M

    style FAST fill:#e8f5e9
```

**Current CORS configuration:**
```python
cors = CORSMiddleware(
    app=app,
    allow_origins=["*"],  # ← open, for development only
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 3. Data Flow Scenarios

### 3.1 Scenario A: Physician Creates a Case with Ultrasound

```mermaid
sequenceDiagram
    actor DOC as Physician
    participant WEB as Clinical Platform<br/>(:3004)
    participant GO as Go API<br/>(:8088)
    participant PG as PostgreSQL<br/>(:5432)
    participant FS as File System
    participant ML as ML API<br/>(:8000)
    participant MODEL as ML Model

    DOC->>WEB: Login (credentials)
    WEB->>GO: POST /api/v1/auth/login
    GO-->>WEB: { access_token, refresh_token }
    WEB-->>DOC: Dashboard

    DOC->>WEB: Click "New Case"
    WEB->>GO: POST /api/v1/cases (patient data)
    GO->>PG: INSERT INTO cases
    GO-->>WEB: { case_id: "uuid" }

    DOC->>WEB: Upload US images (drag & drop)
    WEB->>GO: POST /api/v1/cases/:id/images (multipart)
    GO->>FS: Save file to disk
    GO->>PG: INSERT INTO images (path, case_id, ...)
    GO-->>WEB: { image_id, url, status }

    WEB->>GO: PATCH /api/v1/cases/:id (submit for analysis)
    GO->>ML: POST /inference (metadata JSON + image multipart)
    ML->>MODEL: Run inference
    MODEL-->>ML: { fibrosis_stage, confidence, heatmap_data }
    ML-->>GO: { prediction, explainability }

    GO->>PG: UPDATE cases SET ml_result = ?, status = 'completed'
    GO-->>WEB: { case: { ... ml_result } }
    WEB-->>DOC: Show results (FIB-4, APRI, ML prediction)
```

**Request/response examples:**

```bash
# Step 1: Create case
POST /api/v1/cases
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "patient_id": "P-2024-001",
  "age": 52,
  "gender": "male",
  "hospital_id": "H-001",
  "fib4_score": 2.67,
  "apri_score": 0.85,
  "clinical_notes": "Elevated ALT/AST, history of HBV"
}

# Response
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "patient_id": "P-2024-001",
  "status": "draft",
  "created_at": "2024-01-15T09:30:00Z",
  "created_by": "user-uuid"
}
```

```bash
# Step 2: Upload image
POST /api/v1/cases/550e8400-e29b-41d4-a716-446655440000/images
Content-Type: multipart/form-data
Authorization: Bearer <access_token>

--boundary
Content-Disposition: form-data; name="image"; filename="liver_us_01.jpg"
Content-Type: image/jpeg

<binary data>

# Response
{
  "image_id": "img-uuid-1",
  "case_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "liver_us_01.jpg",
  "file_path": "/data/images/2024/01/15/img-uuid-1.jpg",
  "file_size": 245760,
  "mime_type": "image/jpeg",
  "uploaded_at": "2024-01-15T09:32:00Z"
}
```

```bash
# Step 3: Trigger ML inference
POST /api/v1/cases/550e8400-e29b-41d4-a716-446655440000/analyze
Authorization: Bearer <access_token>

# Response
{
  "case_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "ml_result": {
    "fibrosis_stage": "F3",
    "confidence": 0.87,
    "risk_category": "high",
    "recommendation": "Refer to hepatologist"
  },
  "updated_at": "2024-01-15T09:35:00Z"
}
```

### 3.2 Scenario B: ML Lab — Research & Explainability

```mermaid
sequenceDiagram
    actor MLU as ML Engineer
    participant MLAB as ML Lab<br/>(:3005)
    participant ML as ML API<br/>(:8000)
    participant MODEL as ML Model

    MLU->>MLAB: Open ML Lab
    MLAB-->>MLU: Two tabs: "УЗИ + клиника" / "Только FIB-4/APRI"

    alt Tab: УЗИ + клиника
        MLU->>MLAB: Upload US + enter clinical data
        MLAB->>ML: POST /inference (multipart)
        ML->>MODEL: Run full inference
        MODEL-->>ML: { prediction, segmentation_mask, features }
        ML-->>MLAB: { result, explainability_data }
        MLAB-->>MLU: Show result + ExplainOverlay (SVG)
        MLU->>MLAB: Click on overlay region
        MLAB-->>MLU: Popup with feature explanation
    else Tab: Только FIB-4/APRI
        MLU->>MLAB: Enter FIB-4 and APRI scores
        MLAB->>ML: POST /triage/clinical (JSON)
        ML->>MODEL: Clinical triage
        MODEL-->>ML: { risk_level, recommendation }
        ML-->>MLAB: { triage_result }
        MLAB-->>MLU: Show risk stratification
    end
```

**Request/response examples:**

```bash
# ML Lab → inference (full)
POST /inference
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="metadata"
Content-Type: application/json

{
  "age": 52,
  "gender": "male",
  "fib4": 2.67,
  "apri": 0.85,
  "alt": 78,
  "ast": 112
}

--boundary
Content-Disposition: form-data; name="image"; filename="liver.jpg"
Content-Type: image/jpeg

<binary data>

# Response
{
  "prediction": {
    "fibrosis_stage": "F3",
    "confidence": 0.87,
    "steatosis_grade": "S2",
    "steatosis_confidence": 0.72
  },
  "explainability": {
    "heatmap_url": "/tmp/heatmap_123.png",
    "top_features": [
      {"name": "capsular_irregularity", "contribution": 0.34},
      {"name": "portal_vein_dilation", "contribution": 0.28}
    ],
    "overlay_svg": "<svg>...</svg>"
  }
}
```

```bash
# ML Lab → clinical triage (no image)
POST /triage/clinical
Content-Type: application/json

{
  "age": 52,
  "gender": "male",
  "fib4": 2.67,
  "apri": 0.85,
  "alt": 78,
  "ast": 112,
  "platelets": 180000,
  "bilirubin": 1.2
}

# Response
{
  "triage_result": {
    "risk_level": "high",
    "fib4_interpretation": "Significant fibrosis likely",
    "apri_interpretation": "Advanced fibrosis possible",
    "recommendation": "Refer to hepatologist for elastography",
    "next_steps": ["elastography", "hbv_dna_quantification", "hcv_rna_test"]
  }
}
```

### 3.3 Scenario C: Coordinator Exports Training Data

```mermaid
sequenceDiagram
    actor COOR as Coordinator
    participant WEB as Clinical Platform<br/>(:3004)
    participant GO as Go API<br/>(:8088)
    participant PG as PostgreSQL
    participant FS as File System
    participant ZIP as ZIP Builder

    COOR->>WEB: Login
    WEB->>GO: POST /api/v1/auth/login
    GO-->>WEB: { access_token, refresh_token }

    COOR->>WEB: Navigate to Reports
    WEB->>GO: GET /api/v1/reports/weekly
    GO->>PG: SELECT cases, COUNT, GROUP BY week
    GO-->>WEB: { weekly_stats: [...] }
    WEB-->>COOR: Show KPI cards + charts

    COOR->>WEB: Click "Export Training Data"
    WEB->>GO: GET /api/v1/reports/training-export
    GO->>PG: SELECT cases WHERE ml_result IS NOT NULL
    GO->>FS: Collect image files by path
    GO->>ZIP: Build ZIP: images/ + metadata.json + labels.csv
    ZIP-->>GO: /tmp/training_export_20240115.zip
    GO-->>WEB: application/zip (download)
    WEB-->>COOR: File download: training_export_20240115.zip
```

**Export ZIP structure:**
```
training_export_20240115.zip
├── metadata.json          # All case metadata
├── labels.csv             # Ground truth labels (if available)
├── images/
│   ├── 550e8400-e29b-41d4-a716-446655440000/
│   │   ├── liver_us_01.jpg
│   │   └── liver_us_02.jpg
│   └── 660e8400-e29b-41d4-a716-446655440001/
│       └── liver_us_03.jpg
└── README.md
```

---

## 4. Auth & Security

### 4.1 Current Authentication Flow

```mermaid
sequenceDiagram
    participant WEB as Clinical Platform
    participant NA as NextAuth.js
    participant GO as Go API
    participant PG as PostgreSQL

    WEB->>NA: signIn('credentials', { username, password })
    NA->>GO: POST /api/v1/auth/login
    GO->>PG: SELECT * FROM users WHERE username = ?
    PG-->>GO: { user: { id, username, role, password_hash } }
    GO->>GO: bcrypt.Compare(password, password_hash)
    GO->>GO: Generate JWT pair
    GO-->>NA: { access_token, refresh_token, user: { id, role } }
    NA-->>WEB: Session created (cookie)

    Note over WEB,GO: Subsequent requests
    WEB->>GO: GET /api/v1/cases
    Note right of WEB: Authorization: Bearer <access_token>
    GO->>GO: Validate JWT signature
    GO->>GO: Extract claims (user_id, role, exp)
    GO-->>WEB: { cases: [...] }

    Note over WEB,GO: Token refresh
    WEB->>GO: POST /api/v1/auth/refresh
    Note right of WEB: Body: { refresh_token }
    GO->>GO: Validate refresh_token
    GO->>GO: Generate new access_token
    GO-->>WEB: { access_token, refresh_token }
```

### 4.2 JWT Token Structure

```json
// Access Token payload
{
  "sub": "user-uuid-123",
  "username": "dr.smith",
  "role": "doctor",
  "iat": 1705312800,
  "exp": 1705316400,
  "jti": "unique-token-id"
}

// Refresh Token payload
{
  "sub": "user-uuid-123",
  "token_version": 7,
  "iat": 1705312800,
  "exp": 1707904800,
  "jti": "unique-refresh-id"
}
```

### 4.3 Authorization Matrix

| Endpoint | Coordinator | Doctor | Guest |
|----------|:-----------:|:------:|:-----:|
| `POST /auth/login` | ✅ | ✅ | ✅ |
| `POST /auth/refresh` | ✅ | ✅ | ❌ |
| `POST /cases` | ✅ | ✅ | ❌ |
| `GET /cases` | ✅ (all) | ✅ (own) | ❌ |
| `GET /cases/:id` | ✅ | ✅ (own) | ❌ |
| `PATCH /cases/:id` | ✅ | ✅ (own, draft) | ❌ |
| `DELETE /cases/:id` | ✅ | ❌ | ❌ |
| `POST /cases/:id/images` | ✅ | ✅ | ❌ |
| `GET /surveys` | ✅ | ✅ | ❌ |
| `GET /reports/*` | ✅ | ❌ | ❌ |
| `GET /reports/training-export` | ✅ | ❌ | ❌ |

### 4.4 Rate Limiting (Current)

```go
// Go API — rate limiter configuration
rateLimiters := map[string]RateLimiter{
    "login": {
        requests: 5,    // 5 attempts
        window:   60,   // per 60 seconds
        scope:    "ip", // by IP address
    },
    "refresh": {
        requests: 10,
        window:   60,
        scope:    "user_id",
    },
    "api": {
        requests: 100,
        window:   60,
        scope:    "user_id",
    },
}
```

### 4.5 Audit Logging

All actions are logged to `audit_logs` table:

```sql
INSERT INTO audit_logs (
    id, user_id, action, resource_type, resource_id,
    ip_address, user_agent, request_body, response_status,
    created_at
) VALUES (
    gen_random_uuid(),
    'user-uuid-123',
    'case.create',
    'cases',
    'case-uuid-456',
    '192.168.1.100',
    'Mozilla/5.0...',
    '{"patient_id": "P-2024-001"}',
    201,
    NOW()
);
```

Logged events:

| Action | Resource | Description |
|--------|----------|-------------|
| `auth.login` | `users` | Successful login |
| `auth.login_failed` | `users` | Failed login attempt |
| `auth.refresh` | `users` | Token refresh |
| `case.create` | `cases` | New case created |
| `case.update` | `cases` | Case modified |
| `case.delete` | `cases` | Case deleted |
| `image.upload` | `images` | Image uploaded |
| `image.delete` | `images` | Image deleted |
| `survey.submit` | `surveys` | Survey completed |
| `report.export` | `reports` | Data exported |

### 4.6 Security Checklist — Production-Lite

```mermaid
graph LR
    subgraph "Current"
        C1["CORS: open (*)<br/>ML API"]
        C2["ML API: no auth"]
        C3["ML Lab: no auth"]
        C4["HTTP (no TLS)"]
    end

    subgraph "Production-Lite Target"
        P1["CORS: allowlist only"]
        P2["ML API: API Key"]
        P3["ML Lab: basic auth / IP whitelist"]
        P4["HTTPS via reverse proxy"]
        P5["API Key rotation"]
        P6["Request signing"]
    end

    C1 --> P1
    C2 --> P2
    C3 --> P3
    C4 --> P4

    style C1 fill:#ffccbc
    style C2 fill:#ffccbc
    style C3 fill:#ffccbc
    style C4 fill:#ffccbc
    style P1 fill:#c8e6c9
    style P2 fill:#c8e6c9
    style P3 fill:#c8e6c9
    style P4 fill:#c8e6c9
```

#### 4.6.1 ML API Authentication (recommended implementation)

```python
# services/ml-api/main.py — API Key middleware
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)

ALLOWED_API_KEYS = {
    "hk-live-" + os.environ["ML_API_KEY"],      # Go API
    "hk-lab-" + os.environ["ML_LAB_API_KEY"],   # ML Lab
}

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key not in ALLOWED_API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key"
        )
    return api_key

app = FastAPI(dependencies=[Security(verify_api_key)])
```

#### 4.6.2 CORS Production Configuration

```python
# ML API — production CORS
allow_origins = [
    "https://hepatoscreen.kz",      # Clinical Platform (prod)
    "https://ml.hepatoscreen.kz",   # ML Lab (prod)
    "http://localhost:3004",        # dev
    "http://localhost:3005",        # dev
]
```

```go
// Go API — production CORS
corsConfig := cors.Config{
    AllowOrigins:     []string{"https://hepatoscreen.kz"},
    AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Authorization", "Content-Type", "X-Request-ID"},
    ExposeHeaders:    []string{"X-Total-Count", "X-Page-Count"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
}
```

#### 4.6.3 ML Lab Proxy (recommended)

Instead of direct access to `:8000`, route ML Lab through Go API:

```
ML Lab → /api/proxy/ml/* → Go API (auth check) → ML API (API key)
```

This provides:
- Unified authentication
- Audit logging for ML Lab usage
- Rate limiting
- No exposed ML API port

---

## 5. Docker Configuration

### 5.1 Current `docker-compose.yml`

```yaml
# docker-compose.yml (current)
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: hs-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-hepatoscreen}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-hepatoscreen}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hepatoscreen"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: cmd/api/Dockerfile
    container_name: hs-api
    ports:
      - "8088:8088"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      IMAGE_STORAGE_PATH: /data/images
      ML_API_URL: http://ml-api:8000
    volumes:
      - image_storage:/data/images
    depends_on:
      postgres:
        condition: service_healthy

  ml-api:
    build:
      context: .
      dockerfile: services/ml-api/Dockerfile
    container_name: hs-ml-api
    ports:
      - "8000:8000"
    environment:
      MODEL_PATH: /models
      DEVICE: cpu
    volumes:
      - model_storage:/models
    # ← No healthcheck
    # ← No resource limits

volumes:
  postgres_data:
  image_storage:
  model_storage:
```

### 5.2 Production-Lite Docker Configuration

```yaml
# docker-compose.prod-lite.yml (recommended)
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: hs-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "127.0.0.1:5432:5432"  # Bind to localhost only
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.0"
    restart: unless-stopped

  # Init container: downloads/validates model on startup
  ml-model-loader:
    build:
      context: .
      dockerfile: services/ml-model-loader/Dockerfile
    container_name: hs-ml-model-loader
    environment:
      MODEL_REGISTRY_URL: ${MODEL_REGISTRY_URL}
      MODEL_VERSION: ${MODEL_VERSION:-latest}
      MODEL_PATH: /models
    volumes:
      - model_storage:/models
    restart: "no"
    deploy:
      resources:
        limits:
          memory: 512M

  ml-api:
    build:
      context: .
      dockerfile: services/ml-api/Dockerfile
    container_name: hs-ml-api
    ports:
      - "127.0.0.1:8000:8000"  # Bind to localhost only
    environment:
      MODEL_PATH: /models
      DEVICE: ${DEVICE:-cpu}
      API_KEY: ${ML_API_KEY}
      ML_LAB_API_KEY: ${ML_LAB_API_KEY}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - model_storage:/models:ro  # Read-only mount
    depends_on:
      ml-model-loader:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: cmd/api/Dockerfile
    container_name: hs-api
    ports:
      - "8088:8088"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      IMAGE_STORAGE_PATH: /data/images
      ML_API_URL: http://ml-api:8000
      ML_API_KEY: ${ML_API_KEY}
      ENV: ${ENV:-production}
    volumes:
      - image_storage:/data/images
    depends_on:
      postgres:
        condition: service_healthy
      ml-api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8088/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
    restart: unless-stopped

  # Reverse proxy (nginx) for TLS termination
  nginx:
    image: nginx:alpine
    container_name: hs-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
    driver: local
  image_storage:
    driver: local
  model_storage:
    driver: local
```

### 5.3 Health Check Matrix

| Service | Endpoint | Method | Interval | Timeout | Retries |
|---------|----------|--------|----------|---------|---------|
| `postgres` | `pg_isready` | CMD | 10s | 5s | 5 |
| `api` | `GET /api/v1/health` | HTTP | 30s | 10s | 3 |
| `ml-api` | `GET /health` | HTTP | 30s | 10s | 3 |

---

## 6. OpenAPI / API Contracts

### 6.1 Go API — Endpoints Summary

#### Authentication

```
POST /api/v1/auth/login
POST /api/v1/auth/refresh
```

| Endpoint | Method | Auth | Body | Response |
|----------|--------|------|------|----------|
| `/auth/login` | POST | No | `{ username, password }` | `{ access_token, refresh_token, user }` |
| `/auth/refresh` | POST | No | `{ refresh_token }` | `{ access_token, refresh_token }` |

#### Cases

```
POST   /api/v1/cases
GET    /api/v1/cases
GET    /api/v1/cases/:id
PATCH  /api/v1/cases/:id
DELETE /api/v1/cases/:id
```

| Endpoint | Method | Auth | Body / Params | Response |
|----------|--------|------|---------------|----------|
| `/cases` | POST | Bearer | `{ patient_id, age, gender, hospital_id, fib4_score, apri_score, clinical_notes }` | `Case` object |
| `/cases` | GET | Bearer | `?status=&hospital_id=&page=&limit=` | `{ items: Case[], total, page, limit }` |
| `/cases/:id` | GET | Bearer | — | `Case` object |
| `/cases/:id` | PATCH | Bearer | `{ status, ml_result, clinical_notes }` | `Case` object |
| `/cases/:id` | DELETE | Bearer | — | `204 No Content` |

#### Case Images

```
POST   /api/v1/cases/:id/images       # Upload (multipart)
GET    /api/v1/cases/:id/images       # List
GET    /api/v1/cases/:id/images/:img  # Download
DELETE /api/v1/cases/:id/images/:img  # Delete
GET    /api/v1/cases/:id/archive     # Download ZIP
```

| Endpoint | Method | Auth | Body | Response |
|----------|--------|------|------|----------|
| `/cases/:id/images` | POST | Bearer | `multipart/form-data` (image) | `Image` object |
| `/cases/:id/images` | GET | Bearer | — | `Image[]` |
| `/cases/:id/images/:img` | GET | Bearer | — | `image/jpeg` (binary) |
| `/cases/:id/images/:img` | DELETE | Bearer | — | `204 No Content` |
| `/cases/:id/archive` | GET | Bearer | — | `application/zip` |

#### Surveys

```
POST /api/v1/surveys
GET  /api/v1/surveys
```

| Endpoint | Method | Auth | Body | Response |
|----------|--------|------|------|----------|
| `/surveys` | POST | Bearer | `{ case_id, responses: {...} }` | `Survey` object |
| `/surveys` | GET | Bearer | `?case_id=&page=&limit=` | `{ items: Survey[], total }` |

#### Reports

```
GET /api/v1/reports/weekly
GET /api/v1/reports/stages
GET /api/v1/reports/hospitals
GET /api/v1/reports/excel
GET /api/v1/reports/survey-excel
GET /api/v1/reports/training-export
```

| Endpoint | Method | Auth | Params | Response |
|----------|--------|------|--------|----------|
| `/reports/weekly` | GET | Bearer | `?from=&to=` | `{ weeks: [...] }` |
| `/reports/stages` | GET | Bearer | `?from=&to=` | `{ stages: [...] }` |
| `/reports/hospitals` | GET | Bearer | `?from=&to=` | `{ hospitals: [...] }` |
| `/reports/excel` | GET | Bearer | `?from=&to=` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `/reports/survey-excel` | GET | Bearer | `?from=&to=` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `/reports/training-export` | GET | Bearer | `?from=&to=&status=` | `application/zip` |

### 6.2 ML API — Endpoints Summary

```
GET  /health
POST /triage/clinical
POST /inference
```

| Endpoint | Method | Auth | Body | Response |
|----------|--------|------|------|----------|
| `/health` | GET | No | — | `{ status: "ok", model_loaded: true }` |
| `/triage/clinical` | POST | No* | `{ age, gender, fib4, apri, alt, ast, platelets, bilirubin }` | `{ triage_result }` |
| `/inference` | POST | No* | `multipart: metadata JSON + image file` | `{ prediction, explainability }` |

> \* Auth via API key recommended for production-lite (see §4.6.1).

### 6.3 Request/Response Examples

#### Go API: Case Lifecycle

```bash
# Create case
POST /api/v1/cases
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "patient_id": "P-2024-001",
  "age": 52,
  "gender": "male",
  "hospital_id": "H-001",
  "fib4_score": 2.67,
  "apri_score": 0.85,
  "clinical_notes": "Elevated ALT/AST, history of HBV. No prior treatment.",
  "alt": 78,
  "ast": 112,
  "platelets": 180000,
  "bilirubin": 1.2
}

# 201 Created
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "patient_id": "P-2024-001",
  "age": 52,
  "gender": "male",
  "hospital_id": "H-001",
  "hospital_name": "Городская поликлиника №1",
  "fib4_score": 2.67,
  "apri_score": 0.85,
  "clinical_notes": "Elevated ALT/AST, history of HBV. No prior treatment.",
  "status": "draft",
  "ml_result": null,
  "created_by": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created_by_name": "Dr. Smith",
  "created_at": "2024-01-15T09:30:00Z",
  "updated_at": "2024-01-15T09:30:00Z",
  "images": [],
  "surveys": []
}
```

```bash
# List cases (with pagination)
GET /api/v1/cases?page=1&limit=20&status=completed&hospital_id=H-001
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# 200 OK
{
  "items": [
    { /* case object */ },
    { /* case object */ }
  ],
  "total": 47,
  "page": 1,
  "limit": 20,
  "total_pages": 3
}
```

```bash
# Update case status
PATCH /api/v1/cases/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "status": "submitted",
  "clinical_notes": "Updated: patient reports fatigue."
}

# 200 OK
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "submitted",
  "clinical_notes": "Updated: patient reports fatigue.",
  "updated_at": "2024-01-15T10:15:00Z"
}
```

#### ML API: Full Inference

```bash
POST /inference
Content-Type: multipart/form-data

--boundary123
Content-Disposition: form-data; name="metadata"
Content-Type: application/json

{
  "age": 52,
  "gender": "male",
  "fib4": 2.67,
  "apri": 0.85,
  "alt": 78,
  "ast": 112,
  "platelets": 180000,
  "bilirubin": 1.2,
  "patient_id": "P-2024-001"
}

--boundary123
Content-Disposition: form-data; name="image"; filename="liver_sagittal.jpg"
Content-Type: image/jpeg

<binary image data>
--boundary123--

# 200 OK
{
  "prediction": {
    "fibrosis_stage": "F3",
    "confidence": 0.87,
    "steatosis_grade": "S2",
    "steatosis_confidence": 0.72,
    "portal_hypertension": {
      "present": true,
      "confidence": 0.81
    }
  },
  "explainability": {
    "heatmap_url": "/tmp/heatmap_550e8400.png",
    "top_features": [
      {"name": "capsular_irregularity", "contribution": 0.34, "description_ru": "Неровность капсулы печени"},
      {"name": "portal_vein_dilation", "contribution": 0.28, "description_ru": "Расширение воротной вены"},
      {"name": "parenchyma_heterogeneity", "contribution": 0.21, "description_ru": "Гетерогенность паренхимы"},
      {"name": "surface_nodularity", "contribution": 0.17, "description_ru": "Узловатость поверхности"}
    ],
    "overlay_svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>...</svg>",
    "lime_explanation": {
      "positive_regions": [...],
      "negative_regions": [...]
    }
  },
  "processing_time_ms": 1240,
  "model_version": "liver-v2.1.0"
}
```

### 6.4 Production-Lite API Enhancements

```mermaid
graph TB
    subgraph "Current"
        C1["No API versioning"]
        C2["Basic pagination"]
        C3["No caching"]
        C4["No rate limit headers"]
    end

    subgraph "Target"
        T1["/api/v1/ → /api/v2/"]
        T2["Cursor pagination<br/>for large datasets"]
        T3["Redis cache<br/>for reports"]
        T4["RateLimit headers<br/>X-RateLimit-*"]
        T5["ETag / If-None-Match"]
        T6["Request ID<br/>X-Request-ID"]
    end

    C1 --> T1
    C2 --> T2
    C3 --> T3
    C4 --> T4

    style C1 fill:#ffccbc
    style C2 fill:#ffccbc
    style C3 fill:#ffccbc
    style C4 fill:#ffccbc
    style T1 fill:#c8e6c9
    style T2 fill:#c8e6c9
    style T3 fill:#c8e6c9
    style T4 fill:#c8e6c9
```

#### Recommended Response Headers

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: req_550e8400-e29b-41d4
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705316400
Cache-Control: private, max-age=60
ETag: "33a64df5"
```

---

## 7. Database Schema

### 7.1 Entity Relationship Diagram

```mermaid
erDiagram
    USERS {
        uuid id PK
        string username UK
        string password_hash
        string full_name
        string email UK
        enum role "coordinator|doctor"
        uuid hospital_id FK
        boolean is_active
        int token_version
        timestamp created_at
        timestamp updated_at
    }

    HOSPITALS {
        uuid id PK
        string code UK
        string name
        string region
        string city
        timestamp created_at
    }

    CASES {
        uuid id PK
        string patient_id
        int age
        enum gender "male|female"
        uuid hospital_id FK
        uuid created_by FK
        decimal fib4_score
        decimal apri_score
        int alt
        int ast
        int platelets
        decimal bilirubin
        text clinical_notes
        enum status "draft|submitted|in_review|completed|archived"
        jsonb ml_result
        timestamp created_at
        timestamp updated_at
    }

    IMAGES {
        uuid id PK
        uuid case_id FK
        string filename
        string file_path
        int file_size
        string mime_type
        uuid uploaded_by FK
        timestamp uploaded_at
    }

    SURVEYS {
        uuid id PK
        uuid case_id FK
        jsonb responses
        int total_score
        uuid submitted_by FK
        timestamp submitted_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string resource_type
        string resource_id
        inet ip_address
        text user_agent
        jsonb request_body
        int response_status
        timestamp created_at
    }

    USERS ||--o{ CASES : "creates"
    USERS ||--o{ IMAGES : "uploads"
    USERS ||--o{ SURVEYS : "submits"
    USERS ||--o{ AUDIT_LOGS : "generates"
    HOSPITALS ||--o{ CASES : "contains"
    HOSPITALS ||--o{ USERS : "employs"
    CASES ||--o{ IMAGES : "has"
    CASES ||--o{ SURVEYS : "has"
```

### 7.2 Table Definitions

#### `users`

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(100) UNIQUE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('coordinator', 'doctor')),
    hospital_id     UUID REFERENCES hospitals(id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    token_version   INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_hospital ON users(hospital_id);
CREATE INDEX idx_users_role ON users(role);
```

#### `hospitals`

```sql
CREATE TABLE hospitals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    region      VARCHAR(100),
    city        VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hospitals_code ON hospitals(code);
CREATE INDEX idx_hospitals_region ON hospitals(region);
```

#### `cases`

```sql
CREATE TABLE cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      VARCHAR(50) NOT NULL,
    age             INTEGER NOT NULL CHECK (age > 0 AND age < 150),
    gender          VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    hospital_id     UUID NOT NULL REFERENCES hospitals(id),
    created_by      UUID NOT NULL REFERENCES users(id),
    fib4_score      DECIMAL(5,2),
    apri_score      DECIMAL(5,2),
    alt             INTEGER,
    ast             INTEGER,
    platelets       INTEGER,
    bilirubin       DECIMAL(5,2),
    clinical_notes  TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'in_review', 'completed', 'archived')),
    ml_result       JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_patient ON cases(patient_id);
CREATE INDEX idx_cases_hospital ON cases(hospital_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_created_by ON cases(created_by);
CREATE INDEX idx_cases_created_at ON cases(created_at);
CREATE INDEX idx_cases_ml_result ON cases USING GIN (ml_result);
```

#### `images`

```sql
CREATE TABLE images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    filename    VARCHAR(255) NOT NULL,
    file_path   VARCHAR(500) NOT NULL,
    file_size   INTEGER NOT NULL,
    mime_type   VARCHAR(50) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_images_case ON images(case_id);
CREATE INDEX idx_images_uploaded_at ON images(uploaded_at);
```

#### `surveys`

```sql
CREATE TABLE surveys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    responses       JSONB NOT NULL DEFAULT '{}',
    total_score     INTEGER,
    submitted_by    UUID NOT NULL REFERENCES users(id),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_surveys_case ON surveys(case_id);
CREATE INDEX idx_surveys_submitted_at ON surveys(submitted_at);
CREATE INDEX idx_surveys_responses ON surveys USING GIN (responses);
```

#### `audit_logs`

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     VARCHAR(100),
    ip_address      INET,
    user_agent      TEXT,
    request_body    JSONB,
    response_status INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

### 7.3 Indexing Strategy

```mermaid
graph TB
    subgraph "Primary Indexes"
        PK_USERS["users.id → PK"]
        PK_CASES["cases.id → PK"]
        PK_IMG["images.id → PK"]
        PK_SUR["surveys.id → PK"]
    end

    subgraph "Foreign Key Indexes"
        FK1["cases.hospital_id → FK"]
        FK2["cases.created_by → FK"]
        FK3["images.case_id → FK"]
        FK4["surveys.case_id → FK"]
    end

    subgraph "Query Optimization"
        Q1["cases.status → B-tree"]
        Q2["cases.created_at → B-tree"]
        Q3["cases.ml_result → GIN"]
        Q4["audit_logs.action → B-tree"]
        Q5["audit_logs.created_at → B-tree"]
    end

    subgraph "Full-Text Search (future)"
        FT1["cases.clinical_notes → GIN (tsvector)"]
    end
```

---

## 8. Appendix: Ports & Environment Variables

### 8.1 Port Allocation

| Service | Dev Port | Container Port | Production |
|---------|----------|----------------|------------|
| Clinical Platform | `:3004` | — | `:443` (nginx) |
| ML Lab | `:3005` | — | `:443/ml-lab` (nginx) |
| Go API | — | `:8088` | `:8088` (internal) |
| ML API | — | `:8000` | `:8000` (internal) |
| PostgreSQL | `:5432` | `:5432` | `:5432` (localhost only) |
| nginx | — | `:80`, `:443` | `:80`, `:443` |

### 8.2 Environment Variables

#### Go API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL DSN |
| `JWT_SECRET` | ✅ | — | HS256 secret for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | HS256 secret for refresh tokens |
| `JWT_ACCESS_TTL` | ❌ | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | ❌ | `30d` | Refresh token lifetime |
| `IMAGE_STORAGE_PATH` | ✅ | `/data/images` | Image storage directory |
| `ML_API_URL` | ✅ | `http://ml-api:8000` | ML API endpoint |
| `ML_API_KEY` | ❌ | — | API key for ML API (prod) |
| `ENV` | ❌ | `development` | Environment name |
| `LOG_LEVEL` | ❌ | `info` | Log level |

#### ML API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MODEL_PATH` | ✅ | `/models` | Model files directory |
| `DEVICE` | ❌ | `cpu` | Inference device (`cpu` / `cuda`) |
| `API_KEY` | ❌ | — | API key for Go API access |
| `ML_LAB_API_KEY` | ❌ | — | API key for ML Lab access |
| `LOG_LEVEL` | ❌ | `info` | Log level |
| `MAX_IMAGE_SIZE` | ❌ | `10485760` | Max upload size (bytes) |

#### Clinical Platform (`apps/web`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_URL` | ✅ | `http://localhost:3004` | App base URL |
| `NEXTAUTH_SECRET` | ✅ | — | NextAuth.js secret |
| `API_PROXY_URL` | ✅ | `http://localhost:8088` | Go API URL |

#### ML Lab (`apps/ml-lab`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_ML_API_URL` | ✅ | `http://localhost:8000` | ML API URL |

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-15 | Initial architecture document |

---

*End of Document*
