from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
import uuid


class DocType(str, Enum):
    BANK_STATEMENT = "bank_statement"
    FINANCIAL_REPORT = "financial_report"
    KYC_FORM = "kyc_form"
    LOAN_APPLICATION = "loan_application"
    TAX_DOCUMENT = "tax_document"
    LEGAL_CONTRACT = "legal_contract"
    AUDIT_REPORT = "audit_report"
    GENERAL = "general"


class RedactionStyle(str, Enum):
    BLACK_BOX   = "black_box"    # solid black rectangle (default)
    ASTERISK    = "asterisk"     # ••••••••  (mask char, configurable)
    LAST_FOUR   = "last_four"    # ****6789  (keep last 4 visible)
    X_MASK      = "x_mask"       # XXXXXXXX  (capital X chars)
    LABEL       = "label"        # [SSN] / [ACCOUNT NUMBER]


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class PIIType(str, Enum):
    SSN = "ssn"
    ACCOUNT_NUMBER = "account_number"
    ROUTING_NUMBER = "routing_number"
    CREDIT_CARD = "credit_card"
    EMAIL = "email"
    PHONE = "phone"
    DOB = "dob"
    PASSPORT = "passport"
    DRIVERS_LICENSE = "drivers_license"
    NAME = "name"
    ADDRESS = "address"
    IP_ADDRESS = "ip_address"
    IBAN = "iban"
    SWIFT = "swift"
    TAX_ID = "tax_id"
    EMPLOYEE_ID = "employee_id"


class PIIMatch(BaseModel):
    pii_type: PIIType
    value: str
    redacted_value: str
    page: int
    confidence: float
    detection_method: str  # "regex" | "llm"


class PolicyReference(BaseModel):
    law_name: str
    citation: str
    section: str
    key_point: str           # plain-English summary of the requirement
    url: str
    page_ref: str | None = None
    paragraph_text: str | None = None  # verbatim excerpt from the source document


class Policy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    doc_types: list[DocType]
    pii_types: list[PIIType]
    redaction_style: RedactionStyle = RedactionStyle.BLACK_BOX
    mask_char: str = "*"           # character used for ASTERISK / LAST_FOUR styles
    visible_suffix: int = 4        # digits to keep visible in LAST_FOUR style
    use_llm: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_default: bool = False
    references: list[PolicyReference] = Field(default_factory=list)
    source_url: str | None = None  # set when imported from a URL


class DocumentRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    doc_type: DocType
    policy_id: str | None = None
    status: DocumentStatus = DocumentStatus.UPLOADED
    file_size: int
    page_count: int = 0
    pii_matches: list[PIIMatch] = []
    pii_summary: dict[str, int] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    redacted_at: datetime | None = None
    error: str | None = None
    tokens_used: int = 0          # OpenAI tokens consumed during redaction
    redaction_cost: float = 0.0   # USD cost of the OpenAI call


class CustomField(BaseModel):
    name: str = "Custom Field"
    pattern: str                                    # regex or plain keyword
    is_regex: bool = True
    redaction_style: RedactionStyle = RedactionStyle.BLACK_BOX
    mask_char: str = "*"
    visible_suffix: int = 4


class RedactRequest(BaseModel):
    policy_id: str | None = None
    pii_types: list[PIIType] | None = None
    use_llm: bool = False
    redaction_style: RedactionStyle = RedactionStyle.BLACK_BOX
    mask_char: str = "*"
    visible_suffix: int = 4
    custom_fields: list[CustomField] = []


class PolicyImportRequest(BaseModel):
    url: str
    name_override: str | None = None  # optional custom name


class PolicyImportResult(BaseModel):
    policy_draft: dict[str, Any]   # matches Policy fields (no id / created_at yet)
    source_type: str               # "pdf" | "web"
    pages_analyzed: int
    url: str
    excerpt: str                   # first ~300 chars of extracted text for UI preview


class StatsResponse(BaseModel):
    total_documents: int
    redacted_today: int
    total_pii_found: int
    compliance_rate: float
    documents_by_status: dict[str, int]
    documents_by_type: dict[str, int]
    pii_by_type: dict[str, int]
    recent_activity: list[dict[str, Any]]
