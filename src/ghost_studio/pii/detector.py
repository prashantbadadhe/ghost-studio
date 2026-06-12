"""PII detection engine — OpenAI API as primary, regex as supplement/fallback."""
from __future__ import annotations
import os
import re
import json
import logging
from ..models import PIIMatch, PIIType
from .patterns import PATTERNS

log = logging.getLogger(__name__)

_LABELS: dict[PIIType, str] = {
    PIIType.SSN: "[SSN]",
    PIIType.ACCOUNT_NUMBER: "[ACCOUNT NUMBER]",
    PIIType.ROUTING_NUMBER: "[ROUTING NUMBER]",
    PIIType.CREDIT_CARD: "[CREDIT CARD]",
    PIIType.EMAIL: "[EMAIL]",
    PIIType.PHONE: "[PHONE]",
    PIIType.DOB: "[DATE OF BIRTH]",
    PIIType.PASSPORT: "[PASSPORT]",
    PIIType.DRIVERS_LICENSE: "[DL NUMBER]",
    PIIType.NAME: "[NAME]",
    PIIType.ADDRESS: "[ADDRESS]",
    PIIType.IP_ADDRESS: "[IP ADDRESS]",
    PIIType.IBAN: "[IBAN]",
    PIIType.SWIFT: "[SWIFT/BIC]",
    PIIType.TAX_ID: "[TAX ID]",
    PIIType.EMPLOYEE_ID: "[EMPLOYEE ID]",
}

# These types are best detected by LLM; regex has no reliable patterns for them
_LLM_PREFERRED = {PIIType.NAME, PIIType.ADDRESS}

# Pages shorter than this (after stripping whitespace) are skipped for LLM
_MIN_PAGE_CHARS = 80


def _select_llm_pages(
    pages_text: list[str],
    pii_types: list[PIIType],
) -> list[tuple[int, str]]:
    """
    Return (original_0-based_page_index, text) for pages that need LLM analysis.

    Skipped entirely when no LLM-preferred types (name/address) are requested.
    Blank and near-blank pages are always skipped to save tokens and latency.
    """
    if not any(t in _LLM_PREFERRED for t in pii_types):
        log.debug("No LLM-preferred PII types requested — skipping OpenAI entirely")
        return []

    selected: list[tuple[int, str]] = []
    skipped_blank = 0
    for i, text in enumerate(pages_text):
        if len(text.strip()) < _MIN_PAGE_CHARS:
            skipped_blank += 1
            continue
        selected.append((i, text))

    if skipped_blank:
        log.info("Smart page routing: skipped %d blank/stub page(s)", skipped_blank)
    log.info(
        "Smart page routing: sending %d / %d page(s) to OpenAI",
        len(selected), len(pages_text),
    )
    return selected


# ── OpenAI (primary) ──────────────────────────────────────────────────────────

def detect_with_openai(
    pages_text: list[str],
    pii_types: list[PIIType],
    page_offsets: list[int] | None = None,
) -> tuple[list[PIIMatch], int]:
    """
    Send selected pages to OpenAI GPT-4o-mini and ask it to find all PII.

    page_offsets maps each index in pages_text to the original 1-based page number
    so matches are attributed to the correct document page even when only a subset
    of pages is sent.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        log.warning("OPENAI_API_KEY not set — OpenAI detection skipped")
        return []

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        # Build page-number map: position-in-prompt → original 1-based page
        offsets = page_offsets if page_offsets is not None else list(range(len(pages_text)))
        page_label = {i: offsets[i] + 1 for i in range(len(pages_text))}

        type_list = ", ".join(f'"{t.value}"' for t in pii_types)
        numbered = "\n\n".join(
            f"=== PAGE {page_label[i]} ===\n{text}"
            for i, text in enumerate(pages_text)
        )

        prompt = f"""You are an expert PII detection system used by a banking compliance team.

Analyze the document below and identify EVERY instance of personally identifiable information (PII).

PII types to detect: {type_list}

Rules:
- Copy each value EXACTLY as it appears in the document (preserve dashes, spaces, formatting).
- For names: detect full person names only (not company names, bank names, or place names).
- For addresses: capture the complete street address as one value.
- Include PII found inside transaction descriptions (e.g. account numbers in wire transfer lines,
  email addresses in payment references, employee IDs in payroll entries).
- If the same value appears on multiple pages, report it once with the first page number.
- Do NOT invent or guess values — only report what is literally in the text.

Return ONLY a valid JSON array (no markdown, no explanation). Each element:
{{
  "pii_type": "<one of the types listed above>",
  "value": "<exact text from the document>",
  "page": <1-based page number as shown in the PAGE headers above>,
  "confidence": <0.0 to 1.0>
}}

Document:
{numbered}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=4096,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise PII detection system. Return only valid JSON arrays.",
                },
                {"role": "user", "content": prompt},
            ],
        )

        total_tokens = response.usage.total_tokens if response.usage else 0

        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()

        findings: list[dict] = json.loads(raw)
        matches: list[PIIMatch] = []
        seen: set[tuple[str, str]] = set()

        for f in findings:
            try:
                pt = PIIType(f["pii_type"])
                val = str(f["value"]).strip()
                if not val:
                    continue
                key = (pt.value, val.lower())
                if key in seen:
                    continue
                seen.add(key)
                matches.append(PIIMatch(
                    pii_type=pt,
                    value=val,
                    redacted_value=_LABELS.get(pt, f"[{pt.value.upper()}]"),
                    page=int(f.get("page", 1)),
                    confidence=float(f.get("confidence", 0.90)),
                    detection_method="openai",
                ))
            except (KeyError, ValueError) as e:
                log.debug("Skipping malformed finding %s: %s", f, e)

        log.info("OpenAI detected %d PII instances across %d page(s)", len(matches), len(pages_text))
        return matches, total_tokens

    except json.JSONDecodeError as e:
        log.error("OpenAI returned invalid JSON: %s", e)
        return [], 0
    except Exception as exc:
        log.error("OpenAI detection error: %s", exc)
        return [], 0


# ── Regex (supplement / fallback) ────────────────────────────────────────────

def detect_regex(
    pages_text: list[str],
    pii_types: list[PIIType],
) -> list[PIIMatch]:
    matches: list[PIIMatch] = []
    seen: set[tuple[str, str]] = set()

    for page_idx, text in enumerate(pages_text):
        for pii_type in pii_types:
            if pii_type not in PATTERNS:
                continue
            for pattern, label in PATTERNS[pii_type]:
                for m in pattern.finditer(text):
                    raw = m.group().strip()
                    key = (pii_type.value, raw.lower())
                    if key in seen:
                        continue
                    seen.add(key)
                    matches.append(PIIMatch(
                        pii_type=pii_type,
                        value=raw,
                        redacted_value=label,
                        page=page_idx + 1,
                        confidence=0.97,
                        detection_method="regex",
                    ))

    return matches


# ── Public entry point ────────────────────────────────────────────────────────

# GPT-4o-mini pricing (per token)
_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000   # $0.150 / 1M input tokens
_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000   # $0.600 / 1M output tokens


def detect_pii(
    pages_text: list[str],
    pii_types: list[PIIType],
    use_llm: bool = True,
) -> tuple[list[PIIMatch], int, float]:
    """
    Detect PII using regex + optional OpenAI.
    Returns (matches, total_tokens_used, estimated_cost_usd).
    """
    regex_matches = detect_regex(pages_text, pii_types)
    regex_values: set[str] = {m.value.lower() for m in regex_matches}

    openai_matches: list[PIIMatch] = []
    total_tokens = 0
    if use_llm and os.getenv("OPENAI_API_KEY"):
        llm_pages = _select_llm_pages(pages_text, pii_types)
        if llm_pages:
            page_texts = [t for _, t in llm_pages]
            page_offsets = [i for i, _ in llm_pages]
            openai_matches, total_tokens = detect_with_openai(page_texts, pii_types, page_offsets)

    openai_extra = [m for m in openai_matches if m.value.lower() not in regex_values]
    all_matches = regex_matches + openai_extra

    # Approximate cost: treat total_tokens as ~85% input / 15% output (typical for detection)
    estimated_cost = total_tokens * 0.85 * _INPUT_COST_PER_TOKEN + \
                     total_tokens * 0.15 * _OUTPUT_COST_PER_TOKEN

    log.info(
        "Detection complete: %d regex + %d OpenAI-only = %d total | tokens=%d cost=$%.6f",
        len(regex_matches), len(openai_extra), len(all_matches), total_tokens, estimated_cost,
    )
    return all_matches, total_tokens, estimated_cost
