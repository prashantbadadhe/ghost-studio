# Ghost Studio — Enterprise PII Redaction Platform

Identify and redact sensitive data (SSN, account numbers, credit cards, names, addresses, and more) from PDF documents before sharing with developers, QA, auditors, or external parties.

Built for Banking & Financial Services.

---

## Quick Start

### Option A — Docker (recommended, ~1 min)

```bash
git clone https://github.com/prashantbadadhe/ghost-studio.git
cd ghost-studio

# Optional: add your OpenAI key for AI-assisted name/address detection
echo "OPENAI_API_KEY=sk-proj-..." > .env

docker-compose up --build
```

- **App** → http://localhost:3000  
- **API docs** → http://localhost:8000/api/docs

---

### Option B — Local (Python + Node)

**Requirements:** Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 18+

```bash
git clone https://github.com/prashantbadadhe/ghost-studio.git
cd ghost-studio
./start.sh
```

That's it. The script installs all dependencies and starts both servers.

---

### Option C — Manual

```bash
# Backend (terminal 1)
uv sync
cp .env.example .env          # add OPENAI_API_KEY if you have one
uv run uvicorn src.ghost_studio.main:app --reload --port 8000

# Frontend (terminal 2)
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## Features

| Feature | Details |
|---|---|
| **PII Detection** | Regex patterns for SSN, account/routing numbers, IBAN, SWIFT, credit cards, email, phone, DOB, passport, driver's license, tax ID, employee ID |
| **AI Detection** | OpenAI GPT-4o-mini for names and addresses (optional — set `OPENAI_API_KEY`) |
| **Redaction Styles** | Black box · Asterisk mask (`****`) · Last 4 digits (`****6789`) · X-mask (`XXXX`) · Label (`[SSN]`) |
| **Policy Management** | Built-in GLBA, KYC/BSA, SOX, PCI DSS policies with regulatory citations; import custom policies from any URL |
| **Document Viewer** | Side-by-side original vs redacted view, PII audit trail, re-redact with different settings |
| **Bulk Actions** | Multi-select documents, bulk download or delete |
| **Dashboard** | Live stats, document table with search/filter, activity feed |

---

## Architecture

```
ghost-studio/
├── src/ghost_studio/          # FastAPI backend (Python 3.12)
│   ├── main.py                # App factory, CORS, router registration
│   ├── models.py              # Pydantic models
│   ├── storage.py             # In-memory store (swap for DB in prod)
│   ├── pii/
│   │   ├── patterns.py        # Regex patterns by PIIType
│   │   └── detector.py        # Regex + LLM detection pipeline
│   ├── redaction/
│   │   └── redactor.py        # PyMuPDF: render pages, apply redaction boxes
│   └── routers/
│       ├── documents.py       # Upload, redact, preview, download
│       ├── policies.py        # Policy CRUD + AI import from URL
│       └── stats.py           # Dashboard metrics
└── frontend/                  # Next.js 16, App Router, Turbopack
    ├── app/
    │   ├── page.tsx           # Dashboard
    │   ├── upload/page.tsx    # Upload & redact wizard
    │   ├── documents/[id]/    # Document viewer + re-redact
    │   └── settings/page.tsx  # Policy management + URL import
    ├── components/
    └── lib/
        ├── api.ts             # Axios API client
        └── types.ts           # TypeScript types
```

---

## Environment Variables

**Backend** (`.env`):
```
OPENAI_API_KEY=sk-proj-...   # optional — enables name/address AI detection
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Tech Stack

- **Backend**: FastAPI · PyMuPDF · OpenAI SDK · httpx · pydantic v2 · uv
- **Frontend**: Next.js 16 · shadcn/ui (`@base-ui/react`) · TanStack Query · Tailwind CSS · react-dropzone
- **Redaction engine**: PyMuPDF redact annotations with configurable fill/text overlays
