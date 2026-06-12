"""PDF redaction and page rendering using PyMuPDF (fitz)."""
from __future__ import annotations
import io
import re
import base64
import logging
import fitz
from ..models import PIIMatch, RedactionStyle

log = logging.getLogger(__name__)

_BLACK  = (0, 0, 0)
_NAVY   = (0.05, 0.08, 0.24)
_DARK   = (0.15, 0.15, 0.15)
_WHITE  = (1, 1, 1)


def extract_pages_text(pdf_bytes: bytes) -> list[str]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return [page.get_text() for page in doc]


def get_page_count(pdf_bytes: bytes) -> int:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return len(doc)


def render_page_png(pdf_bytes: bytes, page_idx: int = 0, dpi: int = 150) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if page_idx >= len(doc):
        raise IndexError(f"Page {page_idx} out of range (doc has {len(doc)} pages)")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = doc[page_idx].get_pixmap(matrix=mat, alpha=False)
    return pix.tobytes("png")


def render_page_b64(pdf_bytes: bytes, page_idx: int = 0, dpi: int = 150) -> str:
    return base64.b64encode(render_page_png(pdf_bytes, page_idx, dpi)).decode()


def _mask_last_four(value: str, mask_char: str, visible_suffix: int) -> str:
    """Return a masked string keeping only the last `visible_suffix` alphanumeric chars."""
    digits = re.sub(r"[^A-Za-z0-9]", "", value)
    if len(digits) <= visible_suffix:
        return value
    suffix = digits[-visible_suffix:]
    prefix_len = len(digits) - visible_suffix
    masked = mask_char * min(prefix_len, 8)
    return masked + suffix


def _mask_asterisk(value: str, mask_char: str) -> str:
    """Replace all chars with mask_char (cap length at 10 for display)."""
    return mask_char * min(len(value.strip()), 10)


def _mask_x(value: str) -> str:
    return "X" * min(len(value.strip()), 10)


def redact_pdf(
    pdf_bytes: bytes,
    matches: list[PIIMatch],
    style: RedactionStyle = RedactionStyle.BLACK_BOX,
    mask_char: str = "*",
    visible_suffix: int = 4,
) -> bytes:
    """
    Apply redaction for every PII match using the specified style.

    Styles:
      BLACK_BOX  — solid black fill (physically removes text)
      LABEL      — navy box with [TYPE] label
      ASTERISK   — dark box with ••••• overlay
      LAST_FOUR  — dark box with ****1234 (last N digits visible)
      X_MASK     — dark box with XXXXXXXX overlay
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for match in matches:
        page_idx = match.page - 1
        if page_idx < 0 or page_idx >= len(doc):
            continue
        page = doc[page_idx]

        search_str = match.value.strip()
        if not search_str:
            continue

        rects = page.search_for(search_str)

        for rect in rects:
            if style == RedactionStyle.BLACK_BOX:
                page.add_redact_annot(rect, fill=_BLACK)

            elif style == RedactionStyle.LABEL:
                page.add_redact_annot(
                    rect,
                    text=match.redacted_value,
                    fontsize=7,
                    fill=_NAVY,
                    text_color=_WHITE,
                )

            elif style == RedactionStyle.ASTERISK:
                overlay = _mask_asterisk(match.value, mask_char)
                page.add_redact_annot(
                    rect,
                    text=overlay,
                    fontsize=8,
                    fill=_DARK,
                    text_color=_WHITE,
                )

            elif style == RedactionStyle.LAST_FOUR:
                overlay = _mask_last_four(match.value, mask_char, visible_suffix)
                page.add_redact_annot(
                    rect,
                    text=overlay,
                    fontsize=8,
                    fill=_DARK,
                    text_color=_WHITE,
                )

            elif style == RedactionStyle.X_MASK:
                overlay = _mask_x(match.value)
                page.add_redact_annot(
                    rect,
                    text=overlay,
                    fontsize=8,
                    fill=_DARK,
                    text_color=_WHITE,
                )

        page.apply_redactions()

    buf = io.BytesIO()
    doc.save(buf, garbage=4, deflate=True)
    return buf.getvalue()
