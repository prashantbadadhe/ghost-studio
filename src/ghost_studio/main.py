"""Ghost Studio — FastAPI backend entry point."""
from dotenv import load_dotenv
load_dotenv()  # loads .env from project root before any module reads env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import documents, policies, stats

app = FastAPI(
    title="Ghost Studio API",
    description="Enterprise PII Redaction Platform for Banking & Financial Services",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(policies.router, prefix="/api/policies", tags=["policies"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ghost-studio"}
