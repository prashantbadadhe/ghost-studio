#!/usr/bin/env bash
# Ghost Studio — quick-start script (no Docker required)
# Requirements: Python 3.12+, uv, Node 18+

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Backend ────────────────────────────────────────────────────────────────
echo "▸ Installing backend dependencies…"
cd "$ROOT"
uv sync --quiet

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "  Created .env from .env.example — add OPENAI_API_KEY for AI-assisted detection"
fi

echo "▸ Starting backend on http://localhost:8000 …"
uv run uvicorn src.ghost_studio.main:app --port 8000 &
BACKEND_PID=$!

# ── 2. Frontend ───────────────────────────────────────────────────────────────
cd "$ROOT/frontend"

if [ ! -f ".env.local" ]; then
  cp ".env.example" ".env.local"
fi

echo "▸ Installing frontend dependencies…"
npm install --legacy-peer-deps --silent

echo "▸ Starting frontend on http://localhost:3000 …"
npm run dev &
FRONTEND_PID=$!

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping servers…"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup INT TERM

echo ""
echo "  Ghost Studio running!"
echo "  Frontend →  http://localhost:3000"
echo "  API docs  →  http://localhost:8000/api/docs"
echo ""
echo "  Press Ctrl+C to stop."
wait
