"""Import and analyze a policy document from a URL using AI."""
from __future__ import annotations
import os
import re
import json
import logging
import httpx
import fitz
from ..models import PIIType, DocType

log = logging.getLogger(__name__)

_PII_VALUES = [p.value for p in PIIType]
_DOC_VALUES = [d.value for d in DocType]


async def fetch_text_from_url(url: str) -> tuple[str, str, int]:
    """
    Fetch URL and return (text, source_type, page_count).
    source_type is 'pdf' or 'web'.
    """
    headers = {"User-Agent": "Mozilla/5.0 GhostStudio/1.0 Policy-Importer"}

    async with httpx.AsyncClient(follow_redirects=True, timeout=30, headers=headers) as client:
        resp = await client.get(url)
        resp.raise_for_status()

        ct = resp.headers.get("content-type", "").lower()
        is_pdf = "pdf" in ct or url.lower().split("?")[0].rstrip("/").endswith(".pdf")

        if is_pdf:
            doc = fitz.open(stream=resp.content, filetype="pdf")
            pages = [page.get_text() for page in doc]
            text = "\n\n--- PAGE BREAK ---\n\n".join(pages[:30])
            return text, "pdf", len(pages)
        else:
            html = resp.text
            # Remove scripts, styles, and nav boilerplate
            html = re.sub(r"<(script|style|nav|header|footer)[^>]*>.*?</(script|style|nav|header|footer)>",
                          "", html, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<[^>]+>", " ", html)
            text = re.sub(r"\s+", " ", text).strip()
            sections = max(1, len(text.split()) // 300)
            return text, "web", sections


def analyze_policy_with_openai(url: str, text: str, source_type: str, name_override: str | None) -> dict:
    """Use GPT-4o-mini to extract structured redaction policy from document text."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    name_hint = f'\nUse this as the policy name: "{name_override}"' if name_override else ""

    prompt = f"""You are a banking and financial compliance expert analyzing a regulatory policy document.

Source URL: {url}
Source type: {source_type}{name_hint}

Extract a structured redaction policy from this document. Identify:
1. The policy name and what it governs
2. Which document types it applies to
3. Which PII categories must be protected / redacted
4. The specific sections and paragraphs that mandate this protection (include verbatim text)

Available PII types (use exact values): {", ".join(_PII_VALUES)}
Available document types (use exact values): {", ".join(_DOC_VALUES)}

Return ONLY valid JSON (no markdown) with this structure:
{{
  "name": "<concise policy name>",
  "description": "<1-2 sentence description of what this policy mandates>",
  "doc_types": ["<doc types from the available list>"],
  "pii_types": ["<PII types that this policy requires protecting>"],
  "references": [
    {{
      "law_name": "<law, regulation, or policy section name>",
      "citation": "<citation e.g. '15 U.S.C. § 6801' or 'Section 4.3.2'>",
      "section": "<section title or number>",
      "key_point": "<the specific requirement in plain English, 1-2 sentences>",
      "paragraph_text": "<verbatim excerpt from the document (≤200 chars) that mandates this — null if not found>",
      "page_ref": "<page or paragraph ref if determinable — null otherwise>"
    }}
  ]
}}

Include 2-6 of the most relevant references. If the document is not clearly a policy/regulation,
infer the most likely intent from its content and make a best-effort extraction.

Document text (may be truncated):
{text[:8000]}"""

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=2500,
        temperature=0,
        messages=[
            {"role": "system", "content": "You are a compliance expert. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
    )

    raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    return json.loads(raw)
