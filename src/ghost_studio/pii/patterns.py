"""Regex patterns for structured PII detection in banking/financial documents."""
import re
from ..models import PIIType

# Each entry is (compiled_pattern, label_for_redaction)
PATTERNS: dict[PIIType, list[tuple[re.Pattern, str]]] = {
    PIIType.SSN: [
        (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
        (re.compile(r"\b\d{3}\s\d{2}\s\d{4}\b"), "[SSN]"),
    ],
    PIIType.ACCOUNT_NUMBER: [
        (re.compile(r"\b\d{10,17}\b"), "[ACCOUNT NUMBER]"),
    ],
    PIIType.ROUTING_NUMBER: [
        (re.compile(r"\bRouting(?:\s+Number)?[:\s]+(\d{9})\b", re.IGNORECASE), "[ROUTING NUMBER]"),
        (re.compile(r"\bABA[:\s]+(\d{9})\b", re.IGNORECASE), "[ROUTING NUMBER]"),
    ],
    PIIType.CREDIT_CARD: [
        (re.compile(r"\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"), "[CREDIT CARD]"),
        (re.compile(r"\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b"), "[AMEX]"),
    ],
    PIIType.EMAIL: [
        (re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"), "[EMAIL]"),
    ],
    PIIType.PHONE: [
        (re.compile(r"\b(\+1[-.\s]?)?\(?(\d{3})\)?[-.\s](\d{3})[-.\s](\d{4})\b"), "[PHONE]"),
        (re.compile(r"\b1[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4}\b"), "[PHONE]"),
    ],
    PIIType.DOB: [
        (re.compile(r"\b(0[1-9]|1[0-2])/(0[1-9]|[12]\d|3[01])/(19|20)\d{2}\b"), "[DOB]"),
        (re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+(19|20)\d{2}\b",
                    re.IGNORECASE), "[DOB]"),
        (re.compile(r"\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b"), "[DOB]"),
    ],
    PIIType.PASSPORT: [
        (re.compile(r"\b[A-Z]{1,2}\d{7,9}\b"), "[PASSPORT]"),
    ],
    PIIType.DRIVERS_LICENSE: [
        (re.compile(r"\bDL[:\s#]+([A-Z0-9]{6,12})\b", re.IGNORECASE), "[DL NUMBER]"),
        (re.compile(r"\bDriver(?:'s)?\s+Licen[sc]e[:\s#]+([A-Z0-9]{6,12})\b", re.IGNORECASE), "[DL NUMBER]"),
    ],
    PIIType.IP_ADDRESS: [
        (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP ADDRESS]"),
    ],
    PIIType.IBAN: [
        (re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}\b"), "[IBAN]"),
    ],
    PIIType.SWIFT: [
        (re.compile(r"\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b"), "[SWIFT/BIC]"),
    ],
    PIIType.TAX_ID: [
        (re.compile(r"\b\d{2}-\d{7}\b"), "[TAX ID]"),
        (re.compile(r"\bEIN[:\s]+\d{2}-\d{7}\b", re.IGNORECASE), "[EIN]"),
        (re.compile(r"\bTIN[:\s]+\d{9}\b", re.IGNORECASE), "[TIN]"),
    ],
    PIIType.EMPLOYEE_ID: [
        (re.compile(r"\bEMP(?:LOYEE)?[-\s]?(?:ID|#)[:\s]+([A-Z0-9]{4,12})\b", re.IGNORECASE), "[EMPLOYEE ID]"),
    ],
}
