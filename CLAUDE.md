# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Ghost Studio** — Enterprise PII redaction platform for Banking & Financial Services (hackathon/pilot). Identifies and blacks out sensitive data (SSN, account numbers, names, credit cards, etc.) in PDF documents before sharing with developers, QA, auditors, or external parties.

## Commands

### Backend (FastAPI, port 8000)
```bash
# Install dependencies
uv sync

# Run dev server (auto-reload)
uv run uvicorn src.ghost_studio.main:app --reload --port 8000

# API docs available at http://localhost:8000/api/docs
```

### Frontend (Next.js, port 3000)
```bash
cd frontend
npm install
npm run dev      # development
npm run build    # production build (type checks included)
npm run lint
```

### Run both together
Open two terminals — backend first (port 8000), then frontend (port 3000).

## Architecture

```
ghost-studio/
├── src/ghost_studio/          # FastAPI Python backend
│   ├── main.py                # App factory, CORS, router registration
│   ├── models.py              # Pydantic models (DocumentRecord, Policy, PIIMatch, etc.)
│   ├── storage.py             # InMemoryStore singleton — all state lives here (replace with DB for prod)
│   ├── pii/
│   │   ├── patterns.py        # Regex patterns keyed by PIIType enum
│   │   └── detector.py        # detect_pii() orchestrates regex + LLM detection per page
│   ├── redaction/
│   │   └── redactor.py        # PyMuPDF: extract text, render pages as PNG, apply redaction boxes
│   └── routers/
│       ├── documents.py       # All document endpoints (upload, redact, preview, download, delete)
│       ├── policies.py        # Policy CRUD
│       └── stats.py           # Dashboard metrics
└── frontend/                  # Next.js 16 App Router (Turbopack)
    ├── app/
    │   ├── layout.tsx         # QueryClientProvider + Sidebar + Sonner toasts
    │   ├── page.tsx           # Dashboard (stats + document table, polling every 10s)
    │   ├── upload/page.tsx    # 4-step upload wizard (upload → configure → redacting → done)
    │   ├── documents/[id]/    # Side-by-side PDF viewer + PII audit panel
    │   └── settings/page.tsx  # Policy management (built-in + custom)
    ├── components/
    │   ├── layout/sidebar.tsx         # Dark navy sidebar with nav links
    │   ├── dashboard/stats-cards.tsx  # 4-metric stat cards
    │   └── dashboard/document-table.tsx # Sortable/searchable doc table with row actions
    └── lib/
        ├── api.ts             # Axios API client for all backend endpoints
        └── types.ts           # TypeScript types + label maps (DOC_TYPE_LABELS, PII_TYPE_LABELS)
```

## Key Data Flow

1. **Upload**: `POST /api/documents/upload` (multipart) → stores original PDF bytes in `InMemoryStore.document_bytes`
2. **Redact**: `POST /api/documents/{id}/redact` → runs PII detection across all pages → `redact_pdf()` draws black rectangles → stores result in `InMemoryStore.redacted_bytes`
3. **Preview**: `GET /api/documents/{id}/preview/{page}` / `redacted-preview/{page}` → PyMuPDF renders page to PNG → returns base64 string → frontend displays as `<img>`
4. **Download**: `GET /api/documents/{id}/download-redacted` → streams the stored redacted bytes as `application/pdf`

## PII Detection Engine

- **Regex-first** (`pii/patterns.py`): SSN, account numbers, routing numbers, credit cards, email, phone, DOB, passport, IBAN, SWIFT, tax ID, employee ID
- **Heuristic fallback** (`detector.py/_heuristic_names`): Title-case bigrams for name detection when LLM is off
- **LLM (optional)**: OpenAI `gpt-4o-mini` for names/addresses — requires `OPENAI_API_KEY` env var (set in `.env`)

## Seeded Demo Data

`storage.py` pre-populates 6 sample documents and 4 built-in policies so the dashboard is never empty for demos. Only uploaded documents have actual PDF bytes; demo records return 422 if redaction is attempted.

## UI Tech Stack

- **shadcn/ui** built on `@base-ui/react` (not `@radix-ui`) — `asChild` prop does NOT exist; use `render` prop or direct className on triggers
- **`@tanstack/react-query`** for all API calls, with `refetchInterval` for live status updates
- **`react-dropzone`** for file upload
- Banking color theme: dark navy sidebar (`oklch(0.14 0.025 255)`), blue-600 primary, amber for PII alerts

## Environment Variables

```bash
# Backend (optional — enables LLM-assisted PII detection)
OPENAI_API_KEY=sk-proj-...   # set in .env or shell; loaded via python-dotenv

# Frontend (in frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
```
