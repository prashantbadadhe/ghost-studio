from __future__ import annotations
from fastapi import APIRouter, HTTPException
from ..models import Policy, PolicyImportRequest, PolicyImportResult, PolicyReference
from ..storage import store
import uuid

router = APIRouter()


@router.get("/")
def list_policies():
    return [p.model_dump() for p in store.list_policies()]


@router.post("/")
def create_policy(policy: Policy):
    policy.id = str(uuid.uuid4())
    store.save_policy(policy)
    return policy.model_dump()


@router.put("/{policy_id}")
def update_policy(policy_id: str, updated: Policy):
    if not store.get_policy(policy_id):
        raise HTTPException(404, "Policy not found")
    updated.id = policy_id
    store.save_policy(updated)
    return updated.model_dump()


@router.delete("/{policy_id}")
def delete_policy(policy_id: str):
    if not store.delete_policy(policy_id):
        raise HTTPException(404, "Policy not found")
    return {"deleted": True}


@router.post("/import-from-url")
async def import_policy_from_url(req: PolicyImportRequest):
    """
    Fetch a regulatory/policy document from a URL and use AI to extract
    redaction parameters. Returns a policy draft for the user to review and save.
    """
    from ..policies.importer import fetch_text_from_url, analyze_policy_with_openai

    try:
        text, source_type, page_count = await fetch_text_from_url(req.url)
    except Exception as exc:
        raise HTTPException(400, f"Failed to fetch document: {exc}") from exc

    if not text.strip():
        raise HTTPException(400, "Document appears to be empty or could not be parsed")

    try:
        extracted = analyze_policy_with_openai(req.url, text, source_type, req.name_override)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"AI analysis failed: {exc}") from exc

    # Enrich references with the source URL and add paragraph_text field
    refs = []
    for r in extracted.get("references", []):
        refs.append(PolicyReference(
            law_name=r.get("law_name", ""),
            citation=r.get("citation", ""),
            section=r.get("section", ""),
            key_point=r.get("key_point", ""),
            url=req.url,
            page_ref=r.get("page_ref"),
            paragraph_text=r.get("paragraph_text"),
        ).model_dump())

    policy_draft = {
        "name": extracted.get("name", "Imported Policy"),
        "description": extracted.get("description", ""),
        "doc_types": extracted.get("doc_types", ["general"]),
        "pii_types": extracted.get("pii_types", []),
        "redaction_style": "black_box",
        "mask_char": "*",
        "visible_suffix": 4,
        "use_llm": True,
        "is_default": False,
        "references": refs,
        "source_url": req.url,
    }

    return PolicyImportResult(
        policy_draft=policy_draft,
        source_type=source_type,
        pages_analyzed=page_count,
        url=req.url,
        excerpt=text[:300].strip(),
    ).model_dump()
