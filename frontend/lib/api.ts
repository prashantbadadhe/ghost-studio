import axios from "axios";
import type {
  DocumentRecord,
  Policy,
  Stats,
  PIIType,
  DocType,
  RedactionStyle,
  PolicyImportRequest,
  PolicyImportResult,
} from "./types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

// Documents
export const getDocuments = () =>
  api.get<DocumentRecord[]>("/api/documents/").then((r) => r.data);

export const getDocument = (id: string) =>
  api.get<DocumentRecord>(`/api/documents/${id}`).then((r) => r.data);

export const uploadDocument = (
  file: File,
  docType: DocType,
  policyId?: string
) => {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  if (policyId) form.append("policy_id", policyId);
  return api.post<DocumentRecord>("/api/documents/upload", form).then((r) => r.data);
};

export const redactDocument = (
  id: string,
  opts: {
    policy_id?: string;
    pii_types?: PIIType[];
    use_llm?: boolean;
    redaction_style?: RedactionStyle;
    mask_char?: string;
    visible_suffix?: number;
  }
) =>
  api
    .post<{ status: string; pii_found: number; summary: Record<string, number> }>(
      `/api/documents/${id}/redact`,
      opts
    )
    .then((r) => r.data);

export const getPreviewPage = (id: string, page: number) =>
  api
    .get<{ page: number; image: string; mime: string }>(
      `/api/documents/${id}/preview/${page}`
    )
    .then((r) => r.data);

export const getRedactedPreviewPage = (id: string, page: number) =>
  api
    .get<{ page: number; image: string; mime: string }>(
      `/api/documents/${id}/redacted-preview/${page}`
    )
    .then((r) => r.data);

export const downloadRedacted = (id: string, filename: string) => {
  window.open(`http://localhost:8000/api/documents/${id}/download-redacted`, "_blank");
};

export const downloadOriginal = (id: string) => {
  window.open(`http://localhost:8000/api/documents/${id}/download`, "_blank");
};

export const getReport = (id: string) =>
  api.get(`/api/documents/${id}/report`).then((r) => r.data);

export const deleteDocument = (id: string) =>
  api.delete(`/api/documents/${id}`).then((r) => r.data);

// Policies
export const getPolicies = () =>
  api.get<Policy[]>("/api/policies/").then((r) => r.data);

export const createPolicy = (policy: Omit<Policy, "id" | "created_at">) =>
  api.post<Policy>("/api/policies/", policy).then((r) => r.data);

export const updatePolicy = (id: string, policy: Policy) =>
  api.put<Policy>(`/api/policies/${id}`, policy).then((r) => r.data);

export const deletePolicy = (id: string) =>
  api.delete(`/api/policies/${id}`).then((r) => r.data);

// Policy import
export const importPolicyFromUrl = (req: PolicyImportRequest) =>
  api
    .post<PolicyImportResult>("/api/policies/import-from-url", req)
    .then((r) => r.data);

// Stats
export const getStats = () =>
  api.get<Stats>("/api/stats/").then((r) => r.data);
