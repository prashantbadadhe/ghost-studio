export type DocType =
  | "bank_statement"
  | "financial_report"
  | "kyc_form"
  | "loan_application"
  | "tax_document"
  | "legal_contract"
  | "audit_report"
  | "general";

export type DocumentStatus = "uploaded" | "processing" | "completed" | "failed";

export type PIIType =
  | "ssn"
  | "account_number"
  | "routing_number"
  | "credit_card"
  | "email"
  | "phone"
  | "dob"
  | "passport"
  | "drivers_license"
  | "name"
  | "address"
  | "ip_address"
  | "iban"
  | "swift"
  | "tax_id"
  | "employee_id";

export interface PIIMatch {
  pii_type: PIIType;
  value: string;
  redacted_value: string;
  page: number;
  confidence: number;
  detection_method: string;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  doc_type: DocType;
  policy_id: string | null;
  status: DocumentStatus;
  file_size: number;
  page_count: number;
  pii_matches: PIIMatch[];
  pii_summary: Record<string, number>;
  created_at: string;
  redacted_at: string | null;
  error: string | null;
  tokens_used: number;
  redaction_cost: number;
}

export type RedactionStyle =
  | "black_box"
  | "asterisk"
  | "last_four"
  | "x_mask"
  | "label";

export const REDACTION_STYLE_LABELS: Record<RedactionStyle, string> = {
  black_box: "Black Box",
  asterisk: "Asterisk Mask (•••••)",
  last_four: "Last 4 Digits (****1234)",
  x_mask: "X-Mask (XXXXXXXX)",
  label: "Label ([SSN])",
};

export interface PolicyReference {
  law_name: string;
  citation: string;
  section: string;
  key_point: string;
  url: string;
  page_ref: string | null;
  paragraph_text: string | null;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  doc_types: DocType[];
  pii_types: PIIType[];
  redaction_style: RedactionStyle;
  mask_char: string;
  visible_suffix: number;
  use_llm: boolean;
  created_at: string;
  is_default: boolean;
  references: PolicyReference[];
  source_url: string | null;
}

export interface PolicyImportRequest {
  url: string;
  name_override?: string;
}

export interface PolicyImportResult {
  policy_draft: Omit<Policy, "id" | "created_at">;
  source_type: "pdf" | "web";
  pages_analyzed: number;
  url: string;
  excerpt: string;
}

export interface Stats {
  total_documents: number;
  redacted_today: number;
  total_pii_found: number;
  compliance_rate: number;
  documents_by_status: Record<string, number>;
  documents_by_type: Record<string, number>;
  pii_by_type: Record<string, number>;
  recent_activity: Array<{
    id: string;
    filename: string;
    status: string;
    doc_type: string;
    pii_count: number;
    created_at: string;
  }>;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  bank_statement: "Bank Statement",
  financial_report: "Financial Report",
  kyc_form: "KYC / Onboarding",
  loan_application: "Loan Application",
  tax_document: "Tax Document",
  legal_contract: "Legal Contract",
  audit_report: "Audit Report",
  general: "General",
};

export const PII_TYPE_LABELS: Record<PIIType, string> = {
  ssn: "Social Security Number",
  account_number: "Account Number",
  routing_number: "Routing Number",
  credit_card: "Credit Card",
  email: "Email Address",
  phone: "Phone Number",
  dob: "Date of Birth",
  passport: "Passport Number",
  drivers_license: "Driver's License",
  name: "Full Name",
  address: "Physical Address",
  ip_address: "IP Address",
  iban: "IBAN",
  swift: "SWIFT / BIC",
  tax_id: "Tax ID / EIN",
  employee_id: "Employee ID",
};
