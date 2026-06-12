"use client";
import { useCallback, useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import {
  Upload, FileText, X, CheckCircle2, Loader2, ArrowLeft,
  ShieldCheck, Cpu, Zap, AlertTriangle, ChevronDown, ChevronUp,
  Download, Eye, RefreshCw, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  uploadDocument, redactDocument, getPolicies,
  getPreviewPage, getRedactedPreviewPage, downloadRedacted,
} from "@/lib/api";
import {
  DOC_TYPE_LABELS, PII_TYPE_LABELS, REDACTION_STYLE_LABELS,
  type DocType, type PIIType, type Policy, type RedactionStyle, type CustomField,
} from "@/lib/types";
import CustomFieldsEditor from "@/components/custom-fields-editor";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ALL_PII: PIIType[] = [
  "ssn", "account_number", "routing_number", "credit_card",
  "email", "phone", "dob", "passport", "drivers_license",
  "name", "address", "ip_address", "iban", "swift", "tax_id", "employee_id",
];

const STYLES: RedactionStyle[] = ["black_box", "asterisk", "last_four", "x_mask", "label"];

function guessDocType(name: string): DocType {
  const n = name.toLowerCase();
  if (/statement|bank|acct/.test(n)) return "bank_statement";
  if (/kyc|onboard|customer.*id|id.*verif/.test(n)) return "kyc_form";
  if (/loan|mortgage|credit.*app|application/.test(n)) return "loan_application";
  if (/audit|review/.test(n)) return "audit_report";
  if (/financial|earnings|annual|revenue|p&l/.test(n)) return "financial_report";
  if (/tax|w2|w-2|1099|1040/.test(n)) return "tax_document";
  if (/contract|agreement|legal|nda/.test(n)) return "legal_contract";
  return "general";
}

function bestPolicy(policies: Policy[], docType: DocType): Policy | null {
  return (
    policies.find((p) => p.doc_types.includes(docType)) ??
    policies.find((p) => p.id === "policy-general") ??
    policies[0] ??
    null
  );
}

// ── PDF page viewer ───────────────────────────────────────────────────────────

function PdfPageViewer({
  docId,
  pageCount,
  type,
  label,
  dimmed = false,
}: {
  docId: string;
  pageCount: number;
  type: "original" | "redacted";
  label: string;
  dimmed?: boolean;
}) {
  const queries = useQueries({
    queries: Array.from({ length: Math.max(pageCount, 0) }, (_, i) => ({
      queryKey: [type === "original" ? "preview" : "redacted-preview", docId, i],
      queryFn: () =>
        type === "original"
          ? getPreviewPage(docId, i)
          : getRedactedPreviewPage(docId, i),
      staleTime: Infinity,
      enabled: pageCount > 0,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  return (
    <div className={cn("flex flex-col h-full", dimmed && "opacity-40 pointer-events-none")}>
      <div
        className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0"
        style={
          type === "redacted"
            ? { backgroundColor: "#002A6B", borderColor: "#001d4f" }
            : { backgroundColor: "#1e293b", borderColor: "#0f172a" }
        }
      >
        {type === "redacted" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <Eye className="w-4 h-4 text-slate-300" />
        )}
        <span className="text-sm font-bold text-white uppercase tracking-widest">
          {label}
        </span>
        <span className="ml-auto text-xs font-medium text-slate-300">
          {pageCount} page{pageCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          queries.map((q, i) => (
            <div key={i} className="bg-white shadow-sm rounded-sm overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Page {i + 1}</span>
              </div>
              {q.data?.image ? (
                <img
                  src={`data:image/png;base64,${q.data.image}`}
                  alt={`Page ${i + 1}`}
                  className="w-full block"
                />
              ) : (
                <div className="h-32 flex items-center justify-center bg-slate-50">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type Stage = "idle" | "uploading" | "ready" | "processing" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const { data: policies = [] } = useQuery({ queryKey: ["policies"], queryFn: getPolicies });

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [result, setResult] = useState<{ pii_found: number; summary: Record<string, number> } | null>(null);

  // Ref to prevent multiple uploads from rapid/duplicate drop events
  const stageRef = useRef<Stage>("idle");
  useEffect(() => { stageRef.current = stage; }, [stage]);

  const [docType, setDocType] = useState<DocType>("general");
  const [activePolicy, setActivePolicy] = useState<Policy | null>(null);
  const [customPII, setCustomPII] = useState<Set<PIIType>>(new Set());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [useLLM, setUseLLM] = useState(true);
  const [showAllPII, setShowAllPII] = useState(false);

  // Redaction style state
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>("black_box");
  const [maskChar, setMaskChar] = useState("*");
  const [visibleSuffix, setVisibleSuffix] = useState(4);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  useEffect(() => {
    if (policies.length && !activePolicy) {
      const p = bestPolicy(policies, docType);
      if (p) { setActivePolicy(p); setCustomPII(new Set(p.pii_types)); }
    }
  }, [policies, docType, activePolicy]);

  useEffect(() => {
    if (!isCustomMode && policies.length) {
      const p = bestPolicy(policies, docType);
      if (p) { setActivePolicy(p); setCustomPII(new Set(p.pii_types)); }
    }
  }, [docType, isCustomMode, policies]);

  const effectivePII: PIIType[] = isCustomMode
    ? Array.from(customPII)
    : activePolicy?.pii_types ?? [];

  const uploadMut = useMutation({
    mutationFn: (args: { file: File; docType: DocType }) =>
      uploadDocument(args.file, args.docType),
    onSuccess: (doc) => {
      setUploadedDocId(doc.id);
      setPageCount(doc.page_count);
      setStage("ready");
    },
    onError: () => { toast.error("Upload failed"); setStage("error"); },
  });

  const redactMut = useMutation({
    mutationFn: (docId: string) =>
      redactDocument(docId, {
        policy_id: isCustomMode ? undefined : activePolicy?.id,
        pii_types: effectivePII,
        use_llm: useLLM,
        redaction_style: redactionStyle,
        mask_char: maskChar,
        visible_suffix: visibleSuffix,
        custom_fields: customFields.map(({ _id, ...cf }) => cf),
      }),
    onSuccess: (res) => {
      setResult(res);
      setStage("done");
      toast.success(`${res.pii_found} PII instance${res.pii_found !== 1 ? "s" : ""} redacted`);
    },
    onError: () => { setStage("error"); toast.error("Redaction failed"); },
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted[0]) return;
    const s = stageRef.current;
    // Only allow drop when idle or ready (replace); block during upload/processing/done/error
    if (s !== "idle" && s !== "ready") return;
    const f = accepted[0];
    const dt = guessDocType(f.name);
    setFile(f);
    setDocType(dt);
    setStage("uploading");
    stageRef.current = "uploading";
    uploadMut.mutate({ file: f, docType: dt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxSize: 50 * 1024 * 1024,
    noClick: stage !== "idle",
  });

  const handleRedact = () => {
    if (!uploadedDocId || effectivePII.length === 0) return;
    setStage("processing");
    redactMut.mutate(uploadedDocId);
  };

  // Re-redact: go back to ready state to reconfigure and redact again
  const handleReRedact = () => {
    if (!uploadedDocId) return;
    setResult(null);
    setStage("ready");
  };

  const reset = () => {
    setFile(null); setStage("idle"); setUploadedDocId(null);
    setResult(null); setPageCount(0); setIsCustomMode(false);
  };

  const togglePII = (t: PIIType) => {
    setIsCustomMode(true);
    setCustomPII((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  };

  const visiblePII = showAllPII ? ALL_PII : ALL_PII.slice(0, 10);

  // ── DONE: full-width side-by-side preview ─────────────────────────────────
  if (stage === "done" && uploadedDocId) {
    return (
      <div className="flex flex-col h-screen">
        <header className="bg-white border-b-2 px-6 py-3 flex items-center gap-3 flex-shrink-0"
          style={{ borderBottomColor: "#002A6B" }}>
          <Button variant="ghost" size="sm" className="rounded-sm flex-shrink-0" onClick={reset}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> New
          </Button>
          <Separator orientation="vertical" className="h-5 flex-shrink-0" />
          <div className="w-7 h-7 bg-emerald-50 rounded-sm flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{file?.name}</p>
            <p className="text-xs text-muted-foreground">
              {result?.pii_found ?? 0} PII instance{(result?.pii_found ?? 0) !== 1 ? "s" : ""} redacted
              {" · "}{REDACTION_STYLE_LABELS[redactionStyle]}
            </p>
          </div>
          {result && Object.keys(result.summary).length > 0 && (
            <div className="hidden lg:flex gap-1.5 flex-wrap max-w-xs flex-shrink-0">
              {Object.entries(result.summary)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, count]) => (
                  <span key={type}
                    className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-sm">
                    {type.replace(/_/g, " ")} <b>{count}</b>
                  </span>
                ))}
            </div>
          )}
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" className="rounded-sm"
              onClick={handleReRedact}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-Redact
            </Button>
            <Button size="sm" variant="outline" className="rounded-sm"
              onClick={() => router.push(`/documents/${uploadedDocId}`)}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Audit View
            </Button>
            <Button size="sm" className="text-white rounded-sm"
              style={{ backgroundColor: "#0E6BAD" }}
              onClick={() => downloadRedacted(uploadedDocId, file?.name ?? "redacted.pdf")}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download Redacted
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col border-r border-border">
            <PdfPageViewer docId={uploadedDocId} pageCount={pageCount} type="original" label="Original" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <PdfPageViewer docId={uploadedDocId} pageCount={pageCount} type="redacted" label="Redacted" />
          </div>
        </div>
      </div>
    );
  }

  // ── Normal layout (idle / uploading / ready / processing / error) ─────────
  return (
    <div className="flex flex-col h-screen">
      <header className="bg-white border-b-2 px-8 py-4 flex items-center gap-4 flex-shrink-0"
        style={{ borderBottomColor: "#002A6B" }}>
        <Link href="/">
          <Button variant="ghost" size="sm" className="rounded-sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Dashboard
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight">Upload &amp; Redact</h1>
          <p className="text-xs text-muted-foreground">
            Drop a PDF — instant preview, one click to redact
          </p>
        </div>
        {(stage === "ready" || stage === "processing") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 border border-border px-3 py-1.5 rounded-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {isCustomMode ? "Custom mode" : `Policy: ${activePolicy?.name ?? "—"}`}
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: drop zone / uploading / pdf preview ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border"
          {...(stage === "idle" || stage === "ready" ? getRootProps({ onClick: stage === "ready" ? (e) => e.stopPropagation() : undefined }) : {})}
        >
          {(stage === "idle" || stage === "ready") && <input {...getInputProps()} />}

          {/* IDLE */}
          {stage === "idle" && (
            <div className="flex-1 flex flex-col p-8 overflow-y-auto">
              <div className={cn(
                "flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-sm cursor-pointer transition-all min-h-72",
                isDragActive
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
              )}>
                <div className="w-20 h-20 rounded-sm flex items-center justify-center mb-5"
                  style={{ backgroundColor: "oklch(0.93 0.018 248)" }}>
                  <Upload className="w-10 h-10" style={{ color: "#0E6BAD" }} />
                </div>
                <p className="text-xl font-semibold text-foreground mb-2">
                  {isDragActive ? "Release to upload" : "Drop your PDF here"}
                </p>
                <p className="text-sm text-muted-foreground mb-5">or click to browse files</p>
                <Button variant="outline" size="sm" className="rounded-sm" onClick={(e) => { e.stopPropagation(); }}>
                  Browse Files
                </Button>
                <p className="text-xs text-muted-foreground mt-4">PDF only · Max 50 MB</p>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { icon: Zap, label: "Instant preview", desc: "See pages as soon as you drop the file" },
                  { icon: ShieldCheck, label: "Customize on the fly", desc: "Toggle PII types before redacting" },
                  { icon: Cpu, label: "AI-assisted", desc: "OpenAI finds names & addresses" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 p-4 bg-white rounded-sm border border-border shadow-sm">
                    <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "oklch(0.93 0.018 248)" }}>
                      <Icon className="w-4 h-4" style={{ color: "#0E6BAD" }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPLOADING */}
          {stage === "uploading" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-sm flex items-center justify-center"
                style={{ backgroundColor: "oklch(0.93 0.018 248)" }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#0E6BAD" }} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Uploading {file?.name}…</p>
                <p className="text-xs text-muted-foreground mt-1">Preparing preview</p>
              </div>
            </div>
          )}

          {/* READY — original PDF preview with drag-over hint */}
          {stage === "ready" && uploadedDocId && pageCount > 0 && (
            <div className="flex flex-col h-full relative">
              {isDragActive && (
                <div className="absolute inset-0 bg-blue-50/90 z-10 flex items-center justify-center border-2 border-dashed border-blue-400 rounded-sm m-2">
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                    <p className="font-semibold text-blue-700 text-sm">Drop to replace file</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
                <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{file?.name}</span>
                <Badge variant="secondary" className="text-xs rounded-sm flex-shrink-0">
                  {DOC_TYPE_LABELS[docType]}
                </Badge>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="h-7 w-7 rounded-sm flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PdfPageViewer docId={uploadedDocId} pageCount={pageCount} type="original" label="Preview — Original" />
            </div>
          )}

          {/* PROCESSING */}
          {stage === "processing" && uploadedDocId && pageCount > 0 && (
            <div className="flex flex-col h-full relative">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "#0E6BAD" }} />
                <span className="text-sm font-medium text-muted-foreground truncate flex-1">
                  {useLLM ? "Detecting PII via regex + OpenAI…" : "Detecting PII via regex…"}
                </span>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <PdfPageViewer docId={uploadedDocId} pageCount={pageCount} type="original" label="Original" dimmed />
                <div className="absolute inset-0 flex items-center justify-center" style={{ top: "52px" }}>
                  <div className="bg-white/95 rounded-sm border border-border shadow-lg px-6 py-5 text-center">
                    <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: "#0E6BAD" }} />
                    <p className="text-sm font-semibold mb-1">Redacting…</p>
                    <p className="text-xs text-muted-foreground">
                      {useLLM ? "Running regex + AI detection" : "Running regex detection"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ERROR */}
          {stage === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <AlertTriangle className="w-12 h-12 text-red-400" />
              <p className="font-semibold text-red-700">Something went wrong</p>
              <Button variant="outline" className="rounded-sm" onClick={reset}>Try Again</Button>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: policy config + pinned Redact Now ═══ */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-white border-l border-border overflow-hidden">
          <div className="flex-1 overflow-y-auto">

            {/* Quick Policy */}
            <div className="p-5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Policy</p>
              <div className="space-y-1.5">
                {policies.map((p) => (
                  <button key={p.id}
                    onClick={() => { setActivePolicy(p); setCustomPII(new Set(p.pii_types)); setIsCustomMode(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-all",
                      !isCustomMode && activePolicy?.id === p.id
                        ? "border-blue-300 text-blue-900"
                        : "border-slate-200 hover:border-blue-200 text-foreground hover:bg-slate-50"
                    )}
                    style={!isCustomMode && activePolicy?.id === p.id ? { backgroundColor: "oklch(0.93 0.018 248)" } : undefined}
                  >
                    <ShieldCheck className="w-4 h-4 flex-shrink-0"
                      style={{ color: !isCustomMode && activePolicy?.id === p.id ? "#0E6BAD" : "#94a3b8" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.pii_types.length} PII types</p>
                    </div>
                    {!isCustomMode && activePolicy?.id === p.id && (
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#0E6BAD" }} />
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setIsCustomMode(true)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left transition-all",
                    isCustomMode
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-dashed border-slate-300 hover:border-amber-300 text-muted-foreground hover:bg-amber-50"
                  )}
                >
                  <Cpu className="w-4 h-4 flex-shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold">Custom</p>
                    <p className="text-xs text-muted-foreground">Select PII types below</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Document Type */}
            <div className="p-5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Document Type</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setDocType(val)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-sm border transition-all",
                      docType === val ? "text-white border-transparent" : "border-slate-200 text-muted-foreground hover:border-blue-300"
                    )}
                    style={docType === val ? { backgroundColor: "#0E6BAD" } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* PII Types */}
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  PII Types
                  {isCustomMode && <span className="ml-2 text-amber-600 normal-case font-normal">(custom)</span>}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => { setIsCustomMode(true); setCustomPII(new Set(ALL_PII)); }}
                    className="text-xs text-muted-foreground hover:text-foreground px-1.5">All</button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button onClick={() => { setIsCustomMode(true); setCustomPII(new Set()); }}
                    className="text-xs text-muted-foreground hover:text-foreground px-1.5">None</button>
                </div>
              </div>
              <div className="space-y-1">
                {visiblePII.map((type) => {
                  const checked = isCustomMode
                    ? customPII.has(type)
                    : (activePolicy?.pii_types.includes(type) ?? false);
                  return (
                    <button key={type} onClick={() => togglePII(type)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-xs transition-all text-left",
                        checked ? "bg-slate-50 text-foreground" : "text-muted-foreground hover:bg-slate-50"
                      )}
                    >
                      <div className="w-3.5 h-3.5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: checked ? "#0E6BAD" : "transparent", borderColor: checked ? "#0E6BAD" : "#cbd5e1" }}>
                        {checked && (
                          <svg viewBox="0 0 10 8" className="w-2 h-2">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 truncate">{PII_TYPE_LABELS[type]}</span>
                      {(type === "name" || type === "address") && (
                        <span className="text-xs text-purple-500 font-medium">AI</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowAllPII(!showAllPII)}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
                {showAllPII
                  ? <><ChevronUp className="w-3 h-3" /> Show less</>
                  : <><ChevronDown className="w-3 h-3" /> +{ALL_PII.length - 10} more</>}
              </button>
            </div>

            {/* Redaction Style */}
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Redaction Style</p>
              </div>
              <div className="space-y-1.5">
                {STYLES.map((s) => (
                  <button key={s}
                    onClick={() => setRedactionStyle(s)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-sm border text-left text-xs transition-all",
                      redactionStyle === s
                        ? "border-blue-300 text-blue-900"
                        : "border-slate-200 text-muted-foreground hover:border-blue-200 hover:bg-slate-50"
                    )}
                    style={redactionStyle === s ? { backgroundColor: "oklch(0.93 0.018 248)" } : undefined}
                  >
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                      style={{ borderColor: redactionStyle === s ? "#0E6BAD" : "#cbd5e1" }}>
                      {redactionStyle === s && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0E6BAD" }} />
                      )}
                    </div>
                    <span className="font-medium">{REDACTION_STYLE_LABELS[s]}</span>
                  </button>
                ))}
              </div>

              {/* Extra config for mask-char based styles */}
              {(redactionStyle === "asterisk" || redactionStyle === "last_four") && (
                <div className="mt-3 pt-3 border-t border-border space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-muted-foreground w-20">Mask char</label>
                    <input
                      type="text"
                      maxLength={1}
                      value={maskChar}
                      onChange={(e) => setMaskChar(e.target.value || "*")}
                      className="w-12 text-center text-sm border border-border rounded-sm px-2 py-1 bg-white"
                    />
                  </div>
                  {redactionStyle === "last_four" && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-muted-foreground w-20">Keep last</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={visibleSuffix}
                        onChange={(e) => setVisibleSuffix(Math.max(1, Math.min(8, Number(e.target.value))))}
                        className="w-12 text-center text-sm border border-border rounded-sm px-2 py-1 bg-white"
                      />
                      <span className="text-xs text-muted-foreground">digits</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Preview:{" "}
                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-foreground">
                      {redactionStyle === "asterisk"
                        ? maskChar.repeat(8)
                        : maskChar.repeat(Math.max(0, 4 - visibleSuffix + 4)) + "1234".slice(-visibleSuffix)}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Custom Fields */}
            <div className="p-5 border-b border-border">
              <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
            </div>

            {/* AI toggle */}
            <div className="p-5">
              <button onClick={() => setUseLLM(!useLLM)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-sm border-2 transition-all text-left",
                  useLLM ? "border-blue-300" : "border-slate-200 hover:border-blue-200"
                )}
                style={useLLM ? { backgroundColor: "oklch(0.93 0.018 248)" } : undefined}
              >
                <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: useLLM ? "#0E6BAD" : "#e2e8f0" }}>
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold">AI Detection (OpenAI)</p>
                  <p className="text-xs text-muted-foreground">
                    {useLLM ? "On — names & addresses via GPT-4o mini" : "Off — regex only"}
                  </p>
                </div>
                <div className="w-8 h-4 rounded-full transition-colors relative flex-shrink-0"
                  style={{ backgroundColor: useLLM ? "#0E6BAD" : "#cbd5e1" }}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all",
                    useLLM ? "left-4" : "left-0.5")} />
                </div>
              </button>
            </div>

          </div>

          {/* Pinned Redact Now button */}
          <div className="flex-shrink-0 p-4 border-t border-border bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
            <Button
              className="w-full text-white rounded-sm h-11 text-sm font-semibold"
              style={{ backgroundColor: stage === "processing" ? "#0C5E99" : "#0E6BAD" }}
              disabled={!uploadedDocId || effectivePII.length === 0 || stage === "processing" || stage === "uploading"}
              onClick={handleRedact}
            >
              {stage === "uploading" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</>
              ) : stage === "processing" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redacting…</>
              ) : (
                <><ShieldCheck className="w-4 h-4 mr-2" /> Redact Now</>
              )}
            </Button>
            {!file && (
              <p className="text-xs text-center text-muted-foreground mt-2">Drop a PDF to enable</p>
            )}
            {file && stage === "ready" && effectivePII.length === 0 && (
              <p className="text-xs text-center text-red-500 mt-2">Select at least one PII type</p>
            )}
            {file && stage === "ready" && effectivePII.length > 0 && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {effectivePII.length} PII type{effectivePII.length !== 1 ? "s" : ""} · {REDACTION_STYLE_LABELS[redactionStyle]}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
