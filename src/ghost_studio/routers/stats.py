from datetime import date
from fastapi import APIRouter
from ..models import DocumentStatus, StatsResponse
from ..storage import store

router = APIRouter()


@router.get("/", response_model=StatsResponse)
def get_stats():
    docs = store.list_documents()
    today = date.today()

    total_pii = sum(len(d.pii_matches) for d in docs)
    completed = [d for d in docs if d.status == DocumentStatus.COMPLETED]
    redacted_today = sum(
        1 for d in completed
        if d.redacted_at and d.redacted_at.date() == today
    )
    compliance_rate = (len(completed) / len(docs) * 100) if docs else 100.0

    by_status = {}
    for d in docs:
        by_status[d.status.value] = by_status.get(d.status.value, 0) + 1

    by_type = {}
    for d in docs:
        by_type[d.doc_type.value] = by_type.get(d.doc_type.value, 0) + 1

    pii_by_type: dict[str, int] = {}
    for d in docs:
        for k, v in d.pii_summary.items():
            pii_by_type[k] = pii_by_type.get(k, 0) + v

    recent = []
    for d in sorted(docs, key=lambda x: x.created_at, reverse=True)[:5]:
        pii_count = sum(d.pii_summary.values())
        recent.append({
            "id": d.id,
            "filename": d.filename,
            "status": d.status.value,
            "doc_type": d.doc_type.value,
            "pii_count": pii_count,
            "created_at": d.created_at.isoformat(),
        })

    return StatsResponse(
        total_documents=len(docs),
        redacted_today=redacted_today,
        total_pii_found=total_pii,
        compliance_rate=round(compliance_rate, 1),
        documents_by_status=by_status,
        documents_by_type=by_type,
        pii_by_type=pii_by_type,
        recent_activity=recent,
    )
