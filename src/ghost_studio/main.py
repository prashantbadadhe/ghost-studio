"""Ghost Studio — FastAPI backend entry point."""
from dotenv import load_dotenv
load_dotenv()  # loads .env from project root before any module reads env vars

import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .routers import documents, policies, stats
from .models import PIIType, RedactionStyle
from .pii.patterns import PATTERNS
from .pii.detector import detect_with_openai

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


class TextRedactRequest(BaseModel):
    text: str
    pii_types: list[PIIType] = [p for p in PIIType]
    redaction_style: RedactionStyle = RedactionStyle.BLACK_BOX
    mask_char: str = "*"
    visible_suffix: int = 4
    use_llm: bool = False


_STYLE_LABELS = {
    PIIType.SSN: "[SSN]", PIIType.ACCOUNT_NUMBER: "[ACCOUNT NUMBER]",
    PIIType.ROUTING_NUMBER: "[ROUTING NUMBER]", PIIType.CREDIT_CARD: "[CREDIT CARD]",
    PIIType.EMAIL: "[EMAIL]", PIIType.PHONE: "[PHONE]", PIIType.DOB: "[DATE OF BIRTH]",
    PIIType.PASSPORT: "[PASSPORT]", PIIType.DRIVERS_LICENSE: "[DL NUMBER]",
    PIIType.NAME: "[NAME]", PIIType.ADDRESS: "[ADDRESS]", PIIType.IP_ADDRESS: "[IP ADDRESS]",
    PIIType.IBAN: "[IBAN]", PIIType.SWIFT: "[SWIFT/BIC]",
    PIIType.TAX_ID: "[TAX ID]", PIIType.EMPLOYEE_ID: "[EMPLOYEE ID]",
}


def _apply_text_style(value: str, pii_type: PIIType, style: RedactionStyle, mask_char: str, visible_suffix: int) -> str:
    if style == RedactionStyle.BLACK_BOX or style == RedactionStyle.LABEL:
        return _STYLE_LABELS.get(pii_type, f"[{pii_type.value.upper()}]")
    if style == RedactionStyle.X_MASK:
        return "X" * min(len(value.strip()), 10)
    if style == RedactionStyle.ASTERISK:
        return mask_char * min(len(value.strip()), 10)
    if style == RedactionStyle.LAST_FOUR:
        digits = re.sub(r"[^A-Za-z0-9]", "", value)
        if len(digits) <= visible_suffix:
            return value
        return mask_char * min(len(digits) - visible_suffix, 8) + digits[-visible_suffix:]
    return _STYLE_LABELS.get(pii_type, "[REDACTED]")


@app.post("/api/redact-text")
def redact_text(req: TextRedactRequest):
    """Redact PII from plain text. Returns the redacted text and a list of findings."""
    text = req.text
    findings = []

    # Regex pass
    seen: set[tuple[str, str]] = set()
    for pii_type in req.pii_types:
        if pii_type not in PATTERNS:
            continue
        for pattern, _ in PATTERNS[pii_type]:
            for m in pattern.finditer(text):
                val = m.group().strip()
                key = (pii_type.value, val.lower())
                if key in seen:
                    continue
                seen.add(key)
                findings.append({"pii_type": pii_type.value, "value": val, "method": "regex"})

    # LLM pass
    tokens_used = 0
    if req.use_llm:
        llm_matches, tokens_used = detect_with_openai([text], req.pii_types)
        for m in llm_matches:
            key = (m.pii_type.value, m.value.lower())
            if key not in seen:
                seen.add(key)
                findings.append({"pii_type": m.pii_type.value, "value": m.value, "method": "llm"})

    # Sort longest-first to avoid partial-replacement bugs
    findings.sort(key=lambda f: len(f["value"]), reverse=True)

    redacted = text
    for f in findings:
        pii_type = PIIType(f["pii_type"])
        replacement = _apply_text_style(f["value"], pii_type, req.redaction_style, req.mask_char, req.visible_suffix)
        redacted = redacted.replace(f["value"], replacement)

    return {
        "redacted_text": redacted,
        "findings": findings,
        "tokens_used": tokens_used,
    }
