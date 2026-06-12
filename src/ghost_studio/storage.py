"""In-memory storage for Ghost Studio (hackathon/pilot). Replace with a real DB for production."""
from __future__ import annotations
from datetime import datetime
from .models import (
    DocumentRecord, DocumentStatus, DocType, PIIType, Policy,
    PolicyReference, RedactionStyle, PIIMatch
)
import uuid


class InMemoryStore:
    def __init__(self) -> None:
        self.documents: dict[str, DocumentRecord] = {}
        self.document_bytes: dict[str, bytes] = {}          # original PDF bytes
        self.redacted_bytes: dict[str, bytes] = {}          # redacted PDF bytes
        self.policies: dict[str, Policy] = {}

        self._seed_policies()
        self._seed_documents()

    # ── Policies ────────────────────────────────────────────────────────────

    def _seed_policies(self) -> None:
        defaults = [
            Policy(
                id="policy-bank-stmt",
                name="Bank Statement",
                description=(
                    "Redacts account numbers, SSN, routing numbers, names, addresses, and phone "
                    "numbers from bank statements per GLBA Safeguards Rule and FFIEC guidance."
                ),
                doc_types=[DocType.BANK_STATEMENT],
                pii_types=[PIIType.SSN, PIIType.ACCOUNT_NUMBER, PIIType.ROUTING_NUMBER,
                           PIIType.NAME, PIIType.ADDRESS, PIIType.PHONE],
                is_default=True,
                references=[
                    PolicyReference(
                        law_name="Gramm-Leach-Bliley Act (GLBA) — Safeguards Rule",
                        citation="15 U.S.C. §§ 6801–6809 / 16 CFR Part 314",
                        section="§ 314.4(c) — Access controls for customer financial information",
                        key_point="FIs must limit employee access to customer financial data on a need-to-know basis and protect it from unauthorized disclosure.",
                        url="https://www.ftc.gov/legal-library/browse/rules/safeguards-rule",
                        page_ref="§ 314.4(c), pp. 18–19 of 2023 Final Rule",
                    ),
                    PolicyReference(
                        law_name="FFIEC IT Examination Handbook — Information Security",
                        citation="FFIEC IS Booklet (Nov 2023)",
                        section="Section III.C.2 — Data Classification and Sensitive Information Handling",
                        key_point="Financial institutions must classify customer account data as sensitive and apply commensurate controls before sharing internally or externally.",
                        url="https://ithandbook.ffiec.gov/it-booklets/information-security.aspx",
                        page_ref="Section III.C.2, p. 42",
                    ),
                    PolicyReference(
                        law_name="NIST SP 800-122 — Guide to Protecting PII",
                        citation="NIST Special Publication 800-122",
                        section="Section 2.1 — Definition of PII; Section 4.2 — De-identification",
                        key_point="PII that can be linked to an individual (account numbers, SSN, routing numbers) must be de-identified before sharing in low-trust environments.",
                        url="https://csrc.nist.gov/publications/detail/sp/800-122/final",
                        page_ref="Section 4.2, pp. 4-6 to 4-8",
                    ),
                ],
            ),
            Policy(
                id="policy-kyc",
                name="KYC / Onboarding",
                description=(
                    "Full PII redaction for Know-Your-Customer and loan documents per FinCEN CDD Rule, "
                    "BSA § 326 Customer Identification, and FCRA."
                ),
                doc_types=[DocType.KYC_FORM, DocType.LOAN_APPLICATION],
                pii_types=[p for p in PIIType],
                is_default=True,
                references=[
                    PolicyReference(
                        law_name="Bank Secrecy Act (BSA) — Customer Identification Program",
                        citation="31 U.S.C. § 5318(l) / 31 CFR § 1020.220",
                        section="§ 1020.220(a)(2) — Identifying information to be collected",
                        key_point="Banks must collect name, DOB, address, and government ID number for each new customer; this data must be safeguarded from unauthorized disclosure.",
                        url="https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1020/section-1020.220",
                        page_ref="§ 1020.220(a)(2)(i)",
                    ),
                    PolicyReference(
                        law_name="FinCEN Customer Due Diligence (CDD) Rule",
                        citation="31 CFR § 1010.230",
                        section="§ 1010.230(b) — Beneficial ownership information",
                        key_point="Covered institutions must identify and verify beneficial owners; all collected PII (SSN, passport, address) must be protected against unauthorized access.",
                        url="https://www.fincen.gov/resources/statutes-and-regulations/cdd-final-rule",
                        page_ref="§ 1010.230(b)(1), pp. 29–31 of Final Rule (May 2016)",
                    ),
                    PolicyReference(
                        law_name="Fair Credit Reporting Act (FCRA)",
                        citation="15 U.S.C. § 1681 et seq.",
                        section="§ 1681b — Permissible purposes; § 1681e — Compliance procedures",
                        key_point="Consumer report data (credit history, SSN, DOB) may only be used for permissible purposes and must not be re-disclosed without authorization.",
                        url="https://www.consumerfinance.gov/rules-policy/final-rules/fair-credit-reporting-act/",
                        page_ref="§ 1681b(a), § 1681e(b)",
                    ),
                    PolicyReference(
                        law_name="FFIEC BSA/AML Examination Manual",
                        citation="FFIEC BSA/AML Manual (2023 update)",
                        section="Customer Due Diligence — Core Overview, pp. 56–62",
                        key_point="Examiners verify that all customer-identifying data collected during onboarding is maintained securely and access-logged.",
                        url="https://bsaaml.ffiec.gov/manual/RegulatoryRequirements/01_g",
                        page_ref="Core Overview, pp. 56–62",
                    ),
                ],
            ),
            Policy(
                id="policy-financial-report",
                name="Financial Report",
                description=(
                    "Redacts tax IDs, employee IDs, account numbers, SSNs, and emails from financial "
                    "reports and audit documents per SOX § 302/404 and IRS Publication 1075."
                ),
                doc_types=[DocType.FINANCIAL_REPORT, DocType.AUDIT_REPORT],
                pii_types=[PIIType.TAX_ID, PIIType.ACCOUNT_NUMBER, PIIType.EMPLOYEE_ID,
                           PIIType.SSN, PIIType.EMAIL],
                is_default=True,
                references=[
                    PolicyReference(
                        law_name="Sarbanes-Oxley Act (SOX) — Section 302",
                        citation="15 U.S.C. § 7241 / SEC Rule 13a-15 (17 CFR § 240.13a-15)",
                        section="Section 302 — Corporate Responsibility for Financial Reports",
                        key_point="Officers certifying financial reports are responsible for ensuring material non-public data (employee IDs, tax IDs embedded in reports) are not inadvertently disclosed.",
                        url="https://www.sec.gov/about/laws/soa2002.pdf",
                        page_ref="SOX § 302, p. 45 of 2002 Act; SEC Rule 13a-15(a)",
                    ),
                    PolicyReference(
                        law_name="Sarbanes-Oxley Act (SOX) — Section 404",
                        citation="15 U.S.C. § 7262 / SEC Rule 13a-15(c)",
                        section="Section 404 — Management Assessment of Internal Controls",
                        key_point="Internal controls over financial reporting must include access controls preventing unauthorized disclosure of personally identifiable financial data.",
                        url="https://pcaobus.org/Standards/Auditing/Pages/AS2201.aspx",
                        page_ref="PCAOB AS 2201, ¶ .14–.19",
                    ),
                    PolicyReference(
                        law_name="IRS Publication 1075 — Tax Information Security",
                        citation="IRS Pub. 1075 (Rev. Oct 2021)",
                        section="Section 9.3 — Disclosure and Use; Exhibit 7 — Safeguard Requirements",
                        key_point="Federal Tax Information (FTI), including EINs and SSNs in payroll and tax records, must be redacted before sharing with non-authorized parties.",
                        url="https://www.irs.gov/pub/irs-pdf/p1075.pdf",
                        page_ref="Section 9.3, p. 47; Exhibit 7, pp. 101–103",
                    ),
                ],
            ),
            Policy(
                id="policy-general",
                name="General / Developer Share",
                description=(
                    "Standard PII redaction for developer and QA sharing. "
                    "Covers SSN, credit cards, account numbers, email, phone, and DOB per NIST SP 800-122 and PCI DSS v4.0."
                ),
                doc_types=[DocType.GENERAL],
                pii_types=[PIIType.SSN, PIIType.CREDIT_CARD, PIIType.ACCOUNT_NUMBER,
                           PIIType.EMAIL, PIIType.PHONE, PIIType.DOB],
                is_default=True,
                references=[
                    PolicyReference(
                        law_name="NIST SP 800-122 — Guide to Protecting PII",
                        citation="NIST Special Publication 800-122 (April 2010)",
                        section="Section 4.1 — Categorizing PII; Section 4.2 — De-identification Techniques",
                        key_point="Before sharing documents with developers or testers, organizations must de-identify or pseudonymize all PII to prevent use in non-production environments.",
                        url="https://csrc.nist.gov/publications/detail/sp/800-122/final",
                        page_ref="Section 4.2, pp. 4-6 to 4-8",
                    ),
                    PolicyReference(
                        law_name="PCI DSS v4.0 — Payment Card Industry Data Security Standard",
                        citation="PCI DSS v4.0 (March 2022)",
                        section="Requirement 3.3 — Sensitive authentication data not stored after authorization; Req. 3.5 — PAN protected wherever stored",
                        key_point="Full PANs and CVV/CVCs must be masked (show only last 4 digits) in all non-payment contexts including test documents and developer-facing reports.",
                        url="https://www.pcisecuritystandards.org/document_library/",
                        page_ref="Req. 3.3.1, 3.5.1, pp. 34–41 of PCI DSS v4.0",
                    ),
                    PolicyReference(
                        law_name="GDPR — General Data Protection Regulation",
                        citation="Regulation (EU) 2016/679",
                        section="Article 25 — Data Protection by Design and by Default; Article 32 — Security of Processing",
                        key_point="Personal data shared across systems or teams must be pseudonymized or anonymized by default; appropriate technical measures must prevent re-identification.",
                        url="https://gdpr-info.eu/art-25-gdpr/",
                        page_ref="Art. 25(1), Art. 32(1)(a), OJ L 119/88",
                    ),
                    PolicyReference(
                        law_name="CCPA — California Consumer Privacy Act",
                        citation="Cal. Civ. Code § 1798.100 et seq.",
                        section="§ 1798.150 — Data Security; § 1798.81.5 — Reasonable Security Procedures",
                        key_point="California-resident PII (SSN, financial data, email, DOB) shared without de-identification creates liability under CCPA's private right of action for data breaches.",
                        url="https://oag.ca.gov/privacy/ccpa",
                        page_ref="§ 1798.81.5(a)(1), § 1798.150(a)(1)",
                    ),
                ],
            ),
        ]
        for p in defaults:
            self.policies[p.id] = p

    def _seed_documents(self) -> None:
        """Seed realistic demo documents so the dashboard isn't empty."""
        samples = [
            DocumentRecord(
                id="doc-001",
                filename="Q4_2024_Bank_Statement_Johnson.pdf",
                doc_type=DocType.BANK_STATEMENT,
                policy_id="policy-bank-stmt",
                status=DocumentStatus.COMPLETED,
                file_size=245_312,
                page_count=4,
                pii_matches=[
                    PIIMatch(pii_type=PIIType.ACCOUNT_NUMBER, value="4523789012345678",
                             redacted_value="[ACCOUNT NUMBER]", page=1, confidence=0.99,
                             detection_method="regex"),
                    PIIMatch(pii_type=PIIType.SSN, value="123-45-6789",
                             redacted_value="[SSN]", page=1, confidence=0.99,
                             detection_method="regex"),
                    PIIMatch(pii_type=PIIType.NAME, value="Michael Johnson",
                             redacted_value="[NAME]", page=1, confidence=0.87,
                             detection_method="llm"),
                ],
                pii_summary={"account_number": 3, "ssn": 1, "name": 2, "phone": 1},
                created_at=datetime(2025, 6, 10, 9, 15),
                redacted_at=datetime(2025, 6, 10, 9, 16),
            ),
            DocumentRecord(
                id="doc-002",
                filename="Annual_Audit_Report_2024.pdf",
                doc_type=DocType.AUDIT_REPORT,
                policy_id="policy-financial-report",
                status=DocumentStatus.COMPLETED,
                file_size=1_204_480,
                page_count=12,
                pii_matches=[],
                pii_summary={"tax_id": 5, "account_number": 8, "employee_id": 14, "email": 3},
                created_at=datetime(2025, 6, 9, 14, 30),
                redacted_at=datetime(2025, 6, 9, 14, 35),
            ),
            DocumentRecord(
                id="doc-003",
                filename="KYC_Onboarding_Chen_Alice.pdf",
                doc_type=DocType.KYC_FORM,
                policy_id="policy-kyc",
                status=DocumentStatus.COMPLETED,
                file_size=87_040,
                page_count=2,
                pii_matches=[],
                pii_summary={"ssn": 1, "passport": 1, "dob": 1, "name": 3, "address": 2, "phone": 2},
                created_at=datetime(2025, 6, 9, 10, 0),
                redacted_at=datetime(2025, 6, 9, 10, 1),
            ),
            DocumentRecord(
                id="doc-004",
                filename="Loan_Application_Martinez.pdf",
                doc_type=DocType.LOAN_APPLICATION,
                policy_id="policy-kyc",
                status=DocumentStatus.PROCESSING,
                file_size=312_832,
                page_count=6,
                pii_matches=[],
                pii_summary={},
                created_at=datetime(2025, 6, 11, 8, 45),
            ),
            DocumentRecord(
                id="doc-005",
                filename="UAT_Production_Sample_Dec2024.pdf",
                doc_type=DocType.GENERAL,
                policy_id="policy-general",
                status=DocumentStatus.UPLOADED,
                file_size=54_272,
                page_count=3,
                pii_matches=[],
                pii_summary={},
                created_at=datetime(2025, 6, 11, 9, 0),
            ),
            DocumentRecord(
                id="doc-006",
                filename="Tax_Return_2023_W2_Forms.pdf",
                doc_type=DocType.TAX_DOCUMENT,
                policy_id="policy-financial-report",
                status=DocumentStatus.FAILED,
                file_size=128_000,
                page_count=0,
                pii_matches=[],
                pii_summary={},
                created_at=datetime(2025, 6, 8, 16, 20),
                error="Encrypted PDF — please provide an unlocked version.",
            ),
        ]
        for d in samples:
            self.documents[d.id] = d

    # ── Document helpers ─────────────────────────────────────────────────────

    def list_documents(self) -> list[DocumentRecord]:
        return sorted(self.documents.values(), key=lambda d: d.created_at, reverse=True)

    def get_document(self, doc_id: str) -> DocumentRecord | None:
        return self.documents.get(doc_id)

    def save_document(self, doc: DocumentRecord, original_bytes: bytes) -> None:
        self.documents[doc.id] = doc
        self.document_bytes[doc.id] = original_bytes

    def save_redacted(self, doc_id: str, redacted: bytes) -> None:
        self.redacted_bytes[doc_id] = redacted

    def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self.documents:
            return False
        del self.documents[doc_id]
        self.document_bytes.pop(doc_id, None)
        self.redacted_bytes.pop(doc_id, None)
        return True

    # ── Policy helpers ───────────────────────────────────────────────────────

    def list_policies(self) -> list[Policy]:
        return list(self.policies.values())

    def get_policy(self, policy_id: str) -> Policy | None:
        return self.policies.get(policy_id)

    def save_policy(self, policy: Policy) -> None:
        self.policies[policy.id] = policy

    def delete_policy(self, policy_id: str) -> bool:
        if policy_id not in self.policies:
            return False
        del self.policies[policy_id]
        return True


# Singleton store shared across the app
store = InMemoryStore()
