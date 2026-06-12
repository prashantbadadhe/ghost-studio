from __future__ import annotations
import uuid
from datetime import datetime
from collections import Counter
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import Response, JSONResponse
from ..models import (
    DocumentRecord, DocumentStatus, DocType, PIIType, RedactRequest
)
from ..storage import store
from ..pii.detector import detect_pii
from ..redaction.redactor import (
    extract_pages_text, get_page_count, render_page_b64, redact_pdf
)

router = APIRouter()


@router.get("/")
def list_documents():
    docs = store.list_documents()
    return [d.model_dump() for d in docs]


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: DocType = Form(DocType.GENERAL),
    policy_id: str | None = Form(None),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    # Determine page count for PDFs
    page_count = 0
    if file.filename.lower().endswith(".pdf"):
        try:
            page_count = get_page_count(content)
        except Exception:
            page_count = 0

    doc = DocumentRecord(
        id=str(uuid.uuid4()),
        filename=file.filename,
        doc_type=doc_type,
        policy_id=policy_id,
        file_size=len(content),
        page_count=page_count,
        status=DocumentStatus.UPLOADED,
    )
    store.save_document(doc, content)
    return doc.model_dump()


@router.get("/{doc_id}")
def get_document(doc_id: str):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc.model_dump()


@router.post("/{doc_id}/redact")
def redact_document(doc_id: str, req: RedactRequest = RedactRequest()):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    pdf_bytes = store.document_bytes.get(doc_id)
    if not pdf_bytes:
        raise HTTPException(422, "Original file not available for processing (seeded demo document)")

    # Resolve PII types from policy or request
    pii_types: list[PIIType] = []
    if req.pii_types:
        pii_types = req.pii_types
    elif req.policy_id or doc.policy_id:
        policy = store.get_policy(req.policy_id or doc.policy_id)  # type: ignore[arg-type]
        if policy:
            pii_types = policy.pii_types
    if not pii_types:
        pii_types = [p for p in PIIType]  # default: all types

    doc.status = DocumentStatus.PROCESSING
    store.documents[doc_id] = doc

    try:
        pages_text = extract_pages_text(pdf_bytes)
        matches = detect_pii(pages_text, pii_types, use_llm=req.use_llm)

        policy = store.get_policy(doc.policy_id or "") if doc.policy_id else None
        style = policy.redaction_style if policy else None  # type: ignore[union-attr]

        redacted = redact_pdf(pdf_bytes, matches, style) if matches else pdf_bytes

        store.save_redacted(doc_id, redacted)

        summary = dict(Counter(m.pii_type.value for m in matches))
        doc.pii_matches = matches
        doc.pii_summary = summary
        doc.status = DocumentStatus.COMPLETED
        doc.redacted_at = datetime.utcnow()
        doc.page_count = len(pages_text)
        store.documents[doc_id] = doc

        return {"status": "completed", "pii_found": len(matches), "summary": summary}

    except Exception as exc:
        doc.status = DocumentStatus.FAILED
        doc.error = str(exc)
        store.documents[doc_id] = doc
        raise HTTPException(500, f"Redaction failed: {exc}") from exc


@router.get("/{doc_id}/preview/{page_idx}")
def preview_original(doc_id: str, page_idx: int = 0):
    pdf_bytes = store.document_bytes.get(doc_id)
    if not pdf_bytes:
        raise HTTPException(404, "Original file not available")
    try:
        img_b64 = render_page_b64(pdf_bytes, page_idx)
        return {"page": page_idx, "image": img_b64, "mime": "image/png"}
    except IndexError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{doc_id}/redacted-preview/{page_idx}")
def preview_redacted(doc_id: str, page_idx: int = 0):
    pdf_bytes = store.redacted_bytes.get(doc_id)
    if not pdf_bytes:
        raise HTTPException(404, "Redacted file not ready — run redaction first")
    try:
        img_b64 = render_page_b64(pdf_bytes, page_idx)
        return {"page": page_idx, "image": img_b64, "mime": "image/png"}
    except IndexError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{doc_id}/download")
def download_original(doc_id: str):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    pdf_bytes = store.document_bytes.get(doc_id)
    if not pdf_bytes:
        raise HTTPException(404, "Original file not stored")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.get("/{doc_id}/download-redacted")
def download_redacted(doc_id: str):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    pdf_bytes = store.redacted_bytes.get(doc_id)
    if not pdf_bytes:
        raise HTTPException(404, "Redacted file not ready")
    name = doc.filename.replace(".pdf", "_REDACTED.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{doc_id}/report")
def redaction_report(doc_id: str):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "doc_type": doc.doc_type,
        "status": doc.status,
        "redacted_at": doc.redacted_at.isoformat() if doc.redacted_at else None,
        "total_pii_found": len(doc.pii_matches),
        "pii_summary": doc.pii_summary,
        "pii_matches": [m.model_dump() for m in doc.pii_matches],
        "page_count": doc.page_count,
        "policy_id": doc.policy_id,
    }


@router.delete("/{doc_id}")
def delete_document(doc_id: str):
    if not store.delete_document(doc_id):
        raise HTTPException(404, "Document not found")
    return {"deleted": True}
