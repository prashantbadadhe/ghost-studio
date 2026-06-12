"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Download, ChevronLeft, ChevronRight, AlertCircle,
  Columns2, FileText, Shield, CheckCircle2, RefreshCw, LayoutList,
  Settings2, ChevronDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getDocument, getPreviewPage, getRedactedPreviewPage, downloadRedacted, redactDocument } from "@/lib/api";
import {
  DOC_TYPE_LABELS, PII_TYPE_LABELS, REDACTION_STYLE_LABELS,
  type PIIType, type RedactionStyle,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_PII: PIIType[] = [
  "ssn", "account_number", "routing_number", "credit_card",
  "email", "phone", "dob", "passport", "drivers_license",
  "name", "address", "ip_address", "iban", "swift", "tax_id", "employee_id",
];

const STYLES: RedactionStyle[] = ["black_box", "asterisk", "last_four", "x_mask", "label"];

function PageImage({
  docId, page, type, enabled,
}: { docId: string; page: number; type: "original" | "redacted"; enabled: boolean }) {
  const fetchFn = type === "original" ? getPreviewPage : getRedactedPreviewPage;
  const { data, isLoading, error } = useQuery({
    queryKey: [docId, type, page],
    queryFn: () => fetchFn(docId, page),
    enabled,
  });

  if (!enabled) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100 rounded-lg min-h-96 text-muted-foreground text-sm">
        <div className="text-center">
          <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
          Redaction not run yet
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex-1 skeleton rounded-lg min-h-96" />;
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100 rounded-lg min-h-96 text-muted-foreground text-sm">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
          Preview not available<br />
          <span className="text-xs">(Upload original file to enable preview)</span>
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/png;base64,${data.image}`}
      alt={`${type} page ${page + 1}`}
      className="w-full rounded-lg shadow border border-border"
    />
  );
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.9 ? "text-emerald-700 bg-emerald-50" :
  c >= 0.7 ? "text-amber-700 bg-amber-50" :
  "text-red-700 bg-red-50";

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"side-by-side" | "original" | "redacted">("side-by-side");
  const [showReRedact, setShowReRedact] = useState(false);
  const [selectedPII, setSelectedPII] = useState<Set<PIIType>>(new Set(ALL_PII));
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>("black_box");
  const [showAllReRedactPII, setShowAllReRedactPII] = useState(false);

  const { data: doc, isLoading: docLoading, refetch } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument(id),
    refetchInterval: (q) =>
      q.state.data?.status === "processing" ? 2000 : false,
  });

  const reRedactMut = useMutation({
    mutationFn: () =>
      redactDocument(id, {
        pii_types: Array.from(selectedPII),
        use_llm: true,
        redaction_style: redactionStyle,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.removeQueries({ queryKey: [id, "redacted"] });
      setShowReRedact(false);
      toast.success(`Re-redacted: ${res.pii_found} PII instance${res.pii_found !== 1 ? "s" : ""} found`);
    },
    onError: () => toast.error("Re-redaction failed"),
  });

  if (docLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#0E6BAD" }} />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Document not found
      </div>
    );
  }

  const isCompleted = doc.status === "completed";
  const totalPII = Object.values(doc.pii_summary).reduce((a, b) => a + b, 0);
  const maxPage = Math.max(0, (doc.page_count || 1) - 1);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b-2 px-6 py-3 flex items-center gap-4 flex-shrink-0"
        style={{ borderBottomColor: "#002A6B" }}>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <p className="font-semibold text-sm truncate">{doc.filename}</p>
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              {DOC_TYPE_LABELS[doc.doc_type]}
            </Badge>
            <Badge
              className={cn(
                "text-xs flex-shrink-0",
                isCompleted ? "bg-emerald-100 text-emerald-700 border-0" :
                doc.status === "failed" ? "bg-red-100 text-red-700 border-0" :
                "bg-blue-100 text-blue-700 border-0"
              )}
            >
              {doc.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doc.page_count} page{doc.page_count !== 1 ? "s" : ""} ·{" "}
            {(doc.file_size / 1024).toFixed(0)} KB
            {isCompleted && ` · ${totalPII} PII instance${totalPII !== 1 ? "s" : ""} redacted`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm"
            onClick={() => setShowReRedact(!showReRedact)}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Re-Redact
          </Button>
          {isCompleted && (
            <Button
              size="sm"
              className="text-white rounded-sm"
              style={{ backgroundColor: "#0E6BAD" }}
              onClick={() => downloadRedacted(id, doc.filename)}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download Redacted
            </Button>
          )}
        </div>
      </header>

      {/* Re-Redact panel */}
      {showReRedact && (
        <div className="bg-white border-b border-border px-6 py-4 flex items-start gap-6"
          style={{ borderLeftWidth: 3, borderLeftColor: "#002A6B" }}>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" style={{ color: "#002A6B" }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#002A6B" }}>Re-Redact Configuration</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Redaction Style</p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button key={s}
                      onClick={() => setRedactionStyle(s)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-sm border transition-all",
                        redactionStyle === s ? "text-white border-transparent" : "border-slate-200 text-muted-foreground hover:border-blue-300"
                      )}
                      style={redactionStyle === s ? { backgroundColor: "#002A6B" } : undefined}
                    >
                      {REDACTION_STYLE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">PII Types ({selectedPII.size})</p>
                  <div className="flex gap-2 text-xs">
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedPII(new Set(ALL_PII))}>All</button>
                    <span className="text-muted-foreground">·</span>
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedPII(new Set())}>None</button>
                    <span className="text-muted-foreground">·</span>
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowAllReRedactPII(!showAllReRedactPII)}>
                      {showAllReRedactPII ? "less" : "more"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(showAllReRedactPII ? ALL_PII : ALL_PII.slice(0, 8)).map((pt) => (
                    <button key={pt}
                      onClick={() => setSelectedPII((prev) => { const n = new Set(prev); n.has(pt) ? n.delete(pt) : n.add(pt); return n; })}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-sm border transition-all",
                        selectedPII.has(pt) ? "bg-amber-50 border-amber-300 text-amber-800" : "border-slate-200 text-muted-foreground"
                      )}
                    >
                      {PII_TYPE_LABELS[pt]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pt-6">
            <Button
              size="sm"
              className="text-white rounded-sm"
              style={{ backgroundColor: "#002A6B" }}
              disabled={selectedPII.size === 0 || reRedactMut.isPending}
              onClick={() => reRedactMut.mutate()}
            >
              {reRedactMut.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Redacting…</>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Apply Re-Redact</>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowReRedact(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View mode toggle */}
          <div className="bg-slate-50 border-b border-border px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-white border border-border rounded-lg p-1">
              {(["side-by-side", "original", "redacted"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                    viewMode === mode
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={viewMode === mode ? { backgroundColor: "#002A6B" } : undefined}
                >
                  {mode === "side-by-side" ? (
                    <span className="flex items-center gap-1.5">
                      <Columns2 className="w-3 h-3" /> Side by Side
                    </span>
                  ) : mode}
                </button>
              ))}
            </div>
            {/* Page navigation */}
            {doc.page_count > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {doc.page_count}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={page >= maxPage}
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Page viewer */}
          <div className="flex-1 overflow-auto p-6">
            {viewMode === "side-by-side" ? (
              <div className="grid grid-cols-2 gap-4 min-w-0">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-slate-400 rounded-full" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Original
                    </span>
                  </div>
                  <PageImage docId={id} page={page} type="original" enabled={true} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                      Redacted
                    </span>
                    {isCompleted && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                        Secured
                      </Badge>
                    )}
                  </div>
                  <PageImage docId={id} page={page} type="redacted" enabled={isCompleted} />
                </div>
              </div>
            ) : viewMode === "original" ? (
              <div className="max-w-2xl mx-auto">
                <PageImage docId={id} page={page} type="original" enabled={true} />
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                <PageImage docId={id} page={page} type="redacted" enabled={isCompleted} />
              </div>
            )}
          </div>
        </div>

        {/* Right panel — audit report */}
        <aside className="w-80 flex-shrink-0 border-l border-border bg-white overflow-y-auto">
          <Tabs defaultValue="summary">
            <div className="px-4 pt-4 border-b border-border">
              <TabsList className="w-full">
                <TabsTrigger value="summary" className="flex-1 text-xs">
                  <LayoutList className="w-3.5 h-3.5 mr-1.5" />
                  Summary
                </TabsTrigger>
                <TabsTrigger value="details" className="flex-1 text-xs">
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  PII Details
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="summary" className="p-4 space-y-4 mt-0">
              {/* Status */}
              <div className={cn(
                "p-4 rounded-lg",
                isCompleted ? "bg-emerald-50 border border-emerald-100" :
                doc.status === "failed" ? "bg-red-50 border border-red-100" :
                "bg-blue-50 border border-blue-100"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {isCompleted
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    : <AlertCircle className="w-5 h-5 text-blue-600" />}
                  <span className="font-semibold text-sm">
                    {isCompleted ? "Redaction Complete" : doc.status === "failed" ? "Processing Failed" : "Awaiting Redaction"}
                  </span>
                </div>
                {doc.error && <p className="text-xs text-red-700">{doc.error}</p>}
                {isCompleted && doc.redacted_at && (
                  <p className="text-xs text-emerald-700">
                    {new Date(doc.redacted_at).toLocaleString()}
                  </p>
                )}
              </div>

              {/* PII summary by type */}
              {isCompleted && totalPII > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    PII Found by Type
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(doc.pii_summary)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center gap-2">
                          <div className="flex-1 text-xs">
                            {PII_TYPE_LABELS[type as PIIType] ?? type}
                          </div>
                          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            {count}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {isCompleted && totalPII === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  No PII detected
                </div>
              )}

              {!isCompleted && doc.status === "uploaded" && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Run redaction to see results
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="p-4 mt-0">
              {doc.pii_matches.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {isCompleted ? "No PII instances found" : "Redaction not run yet"}
                </div>
              ) : (
                <div className="space-y-2">
                  {doc.pii_matches.map((m, i) => (
                    <div
                      key={i}
                      className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs font-medium capitalize">
                          {m.pii_type.replace(/_/g, " ")}
                        </Badge>
                        <span className={cn(
                          "text-xs font-medium px-1.5 py-0.5 rounded",
                          CONFIDENCE_COLOR(m.confidence)
                        )}>
                          {Math.round(m.confidence * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs line-through text-muted-foreground max-w-20 truncate">
                          {m.value}
                        </code>
                        <span className="text-slate-400">→</span>
                        <code className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-xs">
                          {m.redacted_value}
                        </code>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Page {m.page}</span>
                        <span className="capitalize">{m.detection_method}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
