"""In-memory storage for Ghost Studio (hackathon/pilot). Replace with a real DB for production."""
from __future__ import annotations
from datetime import datetime
from .models import (
    DocumentRecord, DocumentStatus, DocType, PIIType, Policy,
    PolicyReference, RedactionStyle, PIIMatch
)
import uuid
import fitz  # PyMuPDF


def _make_pdf(pages: list[str]) -> bytes:
    """Create a simple PDF where each string in `pages` is one page of text."""
    doc = fitz.open()
    for content in pages:
        page = doc.new_page(width=595, height=842)
        y = 50
        for line in content.split("\n"):
            if y > 800:
                page = doc.new_page(width=595, height=842)
                y = 50
            if line.startswith("## "):
                page.insert_text((50, y), line[3:], fontsize=13, fontname="helv",
                                 color=(0, 0.16, 0.42))
                y += 20
            elif line.startswith("# "):
                page.insert_text((50, y), line[2:], fontsize=15, fontname="helv",
                                 color=(0, 0.16, 0.42))
                y += 24
            elif line.strip() == "":
                y += 8
            else:
                page.insert_text((50, y), line, fontsize=10, fontname="helv",
                                 color=(0, 0, 0))
                y += 14
    buf = doc.tobytes()
    doc.close()
    return buf


def _redact_pdf_simple(pdf_bytes: bytes, snippets: list[str]) -> bytes:
    """Black-box redact any text on the page that matches a snippet."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page in doc:
        for snip in snippets:
            rects = page.search_for(snip)
            for r in rects:
                page.add_redact_annot(r, fill=(0, 0, 0))
        page.apply_redactions()
    buf = doc.tobytes()
    doc.close()
    return buf


class InMemoryStore:
    def __init__(self) -> None:
        self.documents: dict[str, DocumentRecord] = {}
        self.document_bytes: dict[str, bytes] = {}
        self.redacted_bytes: dict[str, bytes] = {}
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
        """Seed realistic demo documents with real PDF bytes so all features work."""

        # ── Doc 1: Bank Statement ────────────────────────────────────────────
        bs_pii = [
            "4523789012345678", "123-45-6789", "021000021",
            "Michael Johnson", "(415) 555-0182",
        ]
        bs_pdf = _make_pdf([
            "# JPMorgan Chase Bank, N.A.\n"
            "## Q4 2024 Account Statement\n"
            "\n"
            "Customer Name:    Michael Johnson\n"
            "Account Number:   4523789012345678\n"
            "Routing Number:   021000021\n"
            "SSN (last 4):     123-45-6789\n"
            "Phone:            (415) 555-0182\n"
            "Statement Period: October 1 – December 31, 2024\n"
            "\n"
            "## Account Summary\n"
            "Opening Balance:   $12,450.00\n"
            "Total Deposits:    $8,200.00\n"
            "Total Withdrawals: $6,750.00\n"
            "Closing Balance:   $13,900.00\n"
            "\n"
            "## Transaction History\n"
            "10/03  Direct Deposit — JPMC Payroll    +$4,100.00\n"
            "10/07  Amazon.com Purchase               -$142.50\n"
            "10/15  Chase Mortgage Auto-Pay          -$1,850.00\n"
            "10/22  ATM Withdrawal — 123 Main St       -$200.00\n"
            "11/01  Direct Deposit — JPMC Payroll    +$4,100.00\n"
            "11/10  Con Edison — Utility Payment       -$187.40\n"
            "11/18  Wire Transfer Out — Ref 9923AT   -$1,500.00\n"
            "12/01  Direct Deposit — JPMC Payroll    +$4,100.00\n"  ,

            "## Continued — Transaction History (Page 2)\n"
            "\n"
            "12/05  Venmo Transfer to R. Martinez      -$250.00\n"
            "12/12  Grocery — Whole Foods Market        -$89.32\n"
            "12/20  Year-End Bonus Credit            +$2,500.00\n"
            "12/28  Balance Transfer to Savings       -$800.00\n"
            "\n"
            "## Important Notices\n"
            "Your account 4523789012345678 is enrolled in Overdraft Protection.\n"
            "For questions, contact Michael Johnson at (415) 555-0182.\n"
            "\n"
            "This statement is confidential. SSN 123-45-6789 is used for\n"
            "tax reporting purposes only. Routing: 021000021.\n"
            "\n"
            "Member FDIC. Equal Housing Lender.\n"
            "© 2024 JPMorgan Chase Bank, N.A.\n",
        ])
        bs_redacted = _redact_pdf_simple(bs_pdf, bs_pii)
        doc001 = DocumentRecord(
            id="doc-001",
            filename="Q4_2024_Bank_Statement_Johnson.pdf",
            doc_type=DocType.BANK_STATEMENT,
            policy_id="policy-bank-stmt",
            status=DocumentStatus.COMPLETED,
            file_size=len(bs_pdf),
            page_count=2,
            pii_matches=[
                PIIMatch(pii_type=PIIType.ACCOUNT_NUMBER, value="4523789012345678",
                         redacted_value="[ACCOUNT NUMBER]", page=1, confidence=0.99,
                         detection_method="regex"),
                PIIMatch(pii_type=PIIType.SSN, value="123-45-6789",
                         redacted_value="[SSN]", page=1, confidence=0.99,
                         detection_method="regex"),
                PIIMatch(pii_type=PIIType.ROUTING_NUMBER, value="021000021",
                         redacted_value="[ROUTING NUMBER]", page=1, confidence=0.99,
                         detection_method="regex"),
                PIIMatch(pii_type=PIIType.NAME, value="Michael Johnson",
                         redacted_value="[NAME]", page=1, confidence=0.87,
                         detection_method="llm"),
                PIIMatch(pii_type=PIIType.PHONE, value="(415) 555-0182",
                         redacted_value="[PHONE]", page=1, confidence=0.99,
                         detection_method="regex"),
            ],
            pii_summary={"account_number": 3, "ssn": 2, "routing_number": 2, "name": 2, "phone": 2},
            tokens_used=1842,
            redaction_cost=round(1842 * 0.85 * 0.150 / 1_000_000 + 1842 * 0.15 * 0.600 / 1_000_000, 6),
            created_at=datetime(2025, 6, 10, 9, 15),
            redacted_at=datetime(2025, 6, 10, 9, 16),
        )
        self.documents[doc001.id] = doc001
        self.document_bytes[doc001.id] = bs_pdf
        self.redacted_bytes[doc001.id] = bs_redacted

        # ── Doc 2: Audit Report ──────────────────────────────────────────────
        ar_pii = [
            "82-4471039", "EMP-00391", "EMP-00487", "EMP-00512",
            "j.harris@jpmorgan.com", "d.wong@jpmorgan.com",
            "8832901047263", "9910234756821",
        ]
        ar_pages = []
        ar_pages.append(
            "# Annual Audit Report — FY 2024\n"
            "## JPMorgan Chase Internal Audit Division\n"
            "\n"
            "Prepared by: J. Harris   j.harris@jpmorgan.com   EMP-00391\n"
            "Reviewed by: D. Wong     d.wong@jpmorgan.com     EMP-00487\n"
            "Approved by: R. Patel                             EMP-00512\n"
            "Entity Tax ID (EIN): 82-4471039\n"
            "\n"
            "## Executive Summary\n"
            "This report covers the FY 2024 internal audit of the Retail Banking\n"
            "division. Overall compliance posture is SATISFACTORY with 3 findings\n"
            "rated Medium and 1 finding rated Low. No High or Critical findings\n"
            "were identified during this audit cycle.\n"
            "\n"
            "## Scope\n"
            "Accounts reviewed: 1,247  |  Branches audited: 12  |  Period: Jan–Dec 2024\n"
            "Sample account numbers tested: 8832901047263, 9910234756821\n"
        )
        for i in range(2, 13):
            ar_pages.append(
                f"## Chapter {i} — Findings & Observations\n"
                "\n"
                f"Finding {i}.1: Controls over customer data access logs are adequate.\n"
                f"  Reviewer: EMP-00391  |  Status: Closed  |  Risk: Low\n"
                "\n"
                f"Finding {i}.2: Periodic access recertification completed on schedule.\n"
                f"  Reviewer: EMP-00487  |  Status: Closed  |  Risk: Low\n"
                "\n"
                "Supporting data references account 8832901047263 for sampling.\n"
                "EIN 82-4471039 used for regulatory cross-reference filing.\n"
                "\n"
                f"Page {i} of 12\n"
            )
        ar_pdf = _make_pdf(ar_pages)
        ar_redacted = _redact_pdf_simple(ar_pdf, ar_pii)
        doc002 = DocumentRecord(
            id="doc-002",
            filename="Annual_Audit_Report_2024.pdf",
            doc_type=DocType.AUDIT_REPORT,
            policy_id="policy-financial-report",
            status=DocumentStatus.COMPLETED,
            file_size=len(ar_pdf),
            page_count=12,
            pii_matches=[],
            pii_summary={"tax_id": 5, "account_number": 8, "employee_id": 14, "email": 3},
            tokens_used=5214,
            redaction_cost=round(5214 * 0.85 * 0.150 / 1_000_000 + 5214 * 0.15 * 0.600 / 1_000_000, 6),
            created_at=datetime(2025, 6, 9, 14, 30),
            redacted_at=datetime(2025, 6, 9, 14, 35),
        )
        self.documents[doc002.id] = doc002
        self.document_bytes[doc002.id] = ar_pdf
        self.redacted_bytes[doc002.id] = ar_redacted

        # ── Doc 3: KYC Form ──────────────────────────────────────────────────
        kyc_pii = [
            "Alice Chen", "987-65-4320", "1985-03-22",
            "P12345678", "415 Maple Avenue, San Francisco, CA 94102",
            "(628) 555-0147",
        ]
        kyc_pdf = _make_pdf([
            "# Know Your Customer (KYC) Onboarding Form\n"
            "## JPMorgan Chase — Retail Banking\n"
            "\n"
            "## Section 1: Personal Information\n"
            "Full Legal Name:   Alice Chen\n"
            "Date of Birth:     1985-03-22\n"
            "SSN:               987-65-4320\n"
            "Phone:             (628) 555-0147\n"
            "Email:             alice.chen@email.com\n"
            "\n"
            "## Section 2: Identity Verification\n"
            "Primary ID Type:   US Passport\n"
            "Passport Number:   P12345678\n"
            "Expiry Date:       2030-04-15\n"
            "Issuing Country:   United States\n"
            "\n"
            "## Section 3: Address\n"
            "Residential:       415 Maple Avenue, San Francisco, CA 94102\n"
            "Mailing:           Same as above\n"
            "Years at address:  7\n"
            "\n"
            "## Section 4: Employment\n"
            "Employer:          Salesforce, Inc.\n"
            "Position:          Senior Engineer\n"
            "Annual Income:     $185,000\n"
            "\n"
            "## Section 5: CIP Certification\n"
            "I certify that the information provided is accurate.\n"
            "Signature: Alice Chen        Date: 2024-11-05\n",

            "## Section 6: Risk Assessment\n"
            "\n"
            "Customer: Alice Chen    SSN: 987-65-4320\n"
            "Risk tier: STANDARD  |  EDD required: No\n"
            "\n"
            "PEP screening: CLEAR    Sanctions screening: CLEAR\n"
            "Adverse media:  CLEAR   OFAC check: CLEAR\n"
            "\n"
            "Reviewed by: Compliance Officer — Branch 0042\n"
            "Review date: 2024-11-06\n"
            "\n"
            "This form is subject to BSA/AML record-keeping requirements.\n"
            "Retain for 5 years per 31 CFR § 1020.220.\n"
        ])
        kyc_redacted = _redact_pdf_simple(kyc_pdf, kyc_pii)
        doc003 = DocumentRecord(
            id="doc-003",
            filename="KYC_Onboarding_Chen_Alice.pdf",
            doc_type=DocType.KYC_FORM,
            policy_id="policy-kyc",
            status=DocumentStatus.COMPLETED,
            file_size=len(kyc_pdf),
            page_count=2,
            pii_matches=[],
            pii_summary={"ssn": 2, "passport": 1, "dob": 1, "name": 3, "address": 2, "phone": 2},
            tokens_used=987,
            redaction_cost=round(987 * 0.85 * 0.150 / 1_000_000 + 987 * 0.15 * 0.600 / 1_000_000, 6),
            created_at=datetime(2025, 6, 9, 10, 0),
            redacted_at=datetime(2025, 6, 9, 10, 1),
        )
        self.documents[doc003.id] = doc003
        self.document_bytes[doc003.id] = kyc_pdf
        self.redacted_bytes[doc003.id] = kyc_redacted

        # ── Doc 4: Loan Application (processing) ────────────────────────────
        loan_pdf = _make_pdf([
            "# Mortgage Loan Application — Form 1003\n"
            "## JPMorgan Chase Home Lending\n"
            "\n"
            "Applicant:       Carlos Martinez\n"
            "Co-Applicant:    Maria Martinez\n"
            "SSN (Primary):   456-78-9012\n"
            "SSN (Co-App):    456-78-9013\n"
            "DOB (Primary):   1979-07-14\n"
            "Phone:           (312) 555-0293\n"
            "Email:           carlos.martinez@email.com\n"
            "\n"
            "## Property Information\n"
            "Property Address: 2847 N. Clark Street, Chicago, IL 60657\n"
            "Purchase Price:   $620,000\n"
            "Loan Amount:      $496,000\n"
            "Loan Type:        Conventional 30-Year Fixed\n"
            "Interest Rate:    6.875%\n"
            "\n"
            "## Employment — Primary Applicant\n"
            "Employer:         United Airlines Holdings\n"
            "Position:         Senior Operations Manager\n"
            "Years Employed:   9\n"
            "Annual Income:    $142,000\n"
            "\n"
            "## Assets\n"
            "Checking Account: 7734829100    Bank: Chase\n"
            "Savings Account:  7734829101    Bank: Chase\n"
            "Balance:          $84,300\n",

            "## Credit & Liabilities\n"
            "\n"
            "Credit Score (Primary):    748\n"
            "Credit Score (Co-App):     731\n"
            "Monthly Debt Obligations:  $1,240\n"
            "DTI Ratio:                 34.2%\n"
            "\n"
            "## References\n"
            "Name: Carlos Martinez    SSN: 456-78-9012\n"
            "Passport: Z87654321      Expiry: 2027-09-30\n"
            "\n"
            "Status: UNDER REVIEW — Awaiting income verification\n"
            "Loan Officer: Branch 0819, Chicago Loop\n",

            "## Page 3 — Declarations\n"
            "\n"
            "Carlos Martinez declares under penalty of perjury that all\n"
            "information provided in this application is true and correct.\n"
            "\n"
            "SSN: 456-78-9012    DOB: 1979-07-14\n"
            "Driver License: IL-D456-7890-1234\n"
            "\n"
            "Signature: Carlos Martinez    Date: 2025-06-10\n"
            "\n"
            "This application is processed under RESPA, TILA, and ECOA.\n"
            "Retain per HMDA and Regulation B requirements.\n",

            "## Page 4 — Income Verification\n"
            "\n"
            "W-2 Income: $142,000 (2024)   EIN: 36-2408571\n"
            "Employer Contact: hr@united.com\n"
            "\n"
            "Secondary Income:\n"
            "  Rental property at 455 Oak Lane, Evanston, IL 60201\n"
            "  Net rental income: $18,600/year\n"
            "\n"
            "Bank Statements reviewed: 3 months\n"
            "Account: 7734829100  Avg Balance: $41,200\n",

            "## Page 5 — Title & Insurance\n"
            "\n"
            "Title Company:    Chicago Title Insurance Co.\n"
            "Title Order #:    CTI-2025-0044812\n"
            "Homeowners Ins.:  Allstate Policy #HO-8821-44-C\n"
            "\n"
            "Primary applicant SSN 456-78-9012 verified via Equifax.\n"
            "Co-applicant SSN 456-78-9013 verified via TransUnion.\n",

            "## Page 6 — Approval Checklist\n"
            "\n"
            "[ ] Income verified          [ ] Title search complete\n"
            "[ ] Appraisal ordered        [ ] Flood cert obtained\n"
            "[ ] Credit pull authorized   [ ] Rate lock confirmed\n"
            "\n"
            "Estimated closing date: 2025-07-15\n"
            "Loan Officer: jennifer.ross@jpmorgan.com  EMP-00734\n"
            "Branch Manager: david.kim@jpmorgan.com    EMP-00288\n",
        ])
        doc004 = DocumentRecord(
            id="doc-004",
            filename="Loan_Application_Martinez.pdf",
            doc_type=DocType.LOAN_APPLICATION,
            policy_id="policy-kyc",
            status=DocumentStatus.PROCESSING,
            file_size=len(loan_pdf),
            page_count=6,
            pii_matches=[],
            pii_summary={},
            created_at=datetime(2025, 6, 11, 8, 45),
        )
        self.documents[doc004.id] = doc004
        self.document_bytes[doc004.id] = loan_pdf

        # ── Doc 5: UAT Sample (uploaded, not yet redacted) ──────────────────
        uat_pdf = _make_pdf([
            "# UAT Production Sample — December 2024\n"
            "## Internal Use Only — QA Environment\n"
            "\n"
            "Test Case ID:  UAT-2024-1201\n"
            "Tester:        qa-team@jpmorgan.com\n"
            "\n"
            "## Sample Customer Records\n"
            "\n"
            "Record 1:\n"
            "  Name:    Robert Williams\n"
            "  SSN:     234-56-7890\n"
            "  CC:      5500 0000 0000 0004\n"
            "  Email:   r.williams@testmail.com\n"
            "  Phone:   (202) 555-0114\n"
            "  DOB:     1991-11-30\n"
            "\n"
            "Record 2:\n"
            "  Name:    Patricia Lee\n"
            "  Account: 3780902434693\n"
            "  SSN:     345-67-8901\n"
            "  Email:   p.lee@testmail.com\n"
            "  Phone:   (503) 555-0176\n",

            "## Continued — Sample Records (Page 2)\n"
            "\n"
            "Record 3:\n"
            "  Name:    James Thompson\n"
            "  SSN:     567-89-0123\n"
            "  Routing: 122105155\n"
            "  Account: 6011000990139424\n"
            "  DOB:     1968-04-05\n"
            "  Email:   jthompson@testmail.com\n"
            "\n"
            "NOTE: All records in this document are synthetic test data\n"
            "generated for UAT purposes only. Do NOT use in production.\n"
            "\n"
            "This file has not yet been redacted. Upload to Ghost Studio\n"
            "before sharing with external QA vendors.\n",

            "## Page 3 — Test Scenarios\n"
            "\n"
            "Scenario A: Verify SSN 234-56-7890 is masked.\n"
            "Scenario B: Verify credit card 5500 0000 0000 0004 last-4 visible.\n"
            "Scenario C: Verify account 3780902434693 is redacted.\n"
            "Scenario D: Verify emails r.williams@testmail.com are removed.\n"
            "\n"
            "Expected output: all PII replaced per General policy.\n"
            "Reviewer: qa-lead@jpmorgan.com    Date: 2024-12-15\n",
        ])
        doc005 = DocumentRecord(
            id="doc-005",
            filename="UAT_Production_Sample_Dec2024.pdf",
            doc_type=DocType.GENERAL,
            policy_id="policy-general",
            status=DocumentStatus.UPLOADED,
            file_size=len(uat_pdf),
            page_count=3,
            pii_matches=[],
            pii_summary={},
            created_at=datetime(2025, 6, 11, 9, 0),
        )
        self.documents[doc005.id] = doc005
        self.document_bytes[doc005.id] = uat_pdf

        # ── Doc 6: Tax Return (failed — encrypted) ──────────────────────────
        tax_pdf = _make_pdf([
            "# U.S. Individual Income Tax Return — Form 1040\n"
            "## Tax Year 2023\n"
            "\n"
            "Taxpayer Name:        Sarah J. Whitfield\n"
            "SSN:                  678-90-1234\n"
            "Date of Birth:        1977-02-18\n"
            "Spouse Name:          Brian K. Whitfield\n"
            "Spouse SSN:           789-01-2345\n"
            "Address:              99 River Road, Austin, TX 78701\n"
            "\n"
            "Filing Status:        Married Filing Jointly\n"
            "Adjusted Gross Income: $287,400\n"
            "Total Tax:            $54,230\n"
            "Refund Amount:        $2,810\n"
            "\n"
            "## W-2 Employer Information\n"
            "Employer:             Dell Technologies Inc.\n"
            "EIN:                  74-2487834\n"
            "Wages:                $198,000\n"
            "\n"
            "Employer 2:           Airbnb, Inc.\n"
            "EIN:                  26-3518535\n"
            "Wages:                $42,000\n",
        ])
        doc006 = DocumentRecord(
            id="doc-006",
            filename="Tax_Return_2023_W2_Forms.pdf",
            doc_type=DocType.TAX_DOCUMENT,
            policy_id="policy-financial-report",
            status=DocumentStatus.FAILED,
            file_size=len(tax_pdf),
            page_count=1,
            pii_matches=[],
            pii_summary={},
            created_at=datetime(2025, 6, 8, 16, 20),
            error="Encrypted PDF — please provide an unlocked version.",
        )
        self.documents[doc006.id] = doc006
        self.document_bytes[doc006.id] = tax_pdf

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
