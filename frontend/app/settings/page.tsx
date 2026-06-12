"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Shield, ChevronDown, ArrowLeft, Save, X, ExternalLink, BookOpen,
  Link2, Loader2, Sparkles, FileText, Globe, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getPolicies, createPolicy, deletePolicy, importPolicyFromUrl } from "@/lib/api";
import {
  DOC_TYPE_LABELS, PII_TYPE_LABELS, REDACTION_STYLE_LABELS,
  type DocType, type PIIType, type Policy, type PolicyReference, type PolicyImportResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ALL_PII: PIIType[] = [
  "ssn", "account_number", "routing_number", "credit_card",
  "email", "phone", "dob", "passport", "drivers_license",
  "name", "address", "ip_address", "iban", "swift", "tax_id", "employee_id",
];

const ALL_DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[];

function ReferenceTable({ refs }: { refs: PolicyReference[] }) {
  if (!refs.length) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-3.5 h-3.5" style={{ color: "#0E6BAD" }} />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Regulatory References
        </p>
      </div>
      <div className="space-y-3">
        {refs.map((ref, i) => (
          <div key={i} className="rounded-sm border border-border bg-white overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3"
              style={{ backgroundColor: "#002A6B" }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{ref.law_name}</p>
                <p className="text-xs text-blue-200 mt-0.5 font-mono">{ref.citation}</p>
              </div>
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-blue-200 hover:text-white transition-colors mt-0.5"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-border">
              <div className="px-4 py-2.5 grid grid-cols-[90px_1fr] gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Section</span>
                <span className="text-xs text-foreground font-mono">{ref.section}</span>
              </div>
              {ref.page_ref && (
                <div className="px-4 py-2.5 grid grid-cols-[90px_1fr] gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Reference</span>
                  <span className="text-xs text-foreground font-mono">{ref.page_ref}</span>
                </div>
              )}
              <div className="px-4 py-2.5 grid grid-cols-[90px_1fr] gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Requirement</span>
                <span className="text-xs text-foreground leading-relaxed">{ref.key_point}</span>
              </div>
              {ref.paragraph_text && (
                <div className="px-4 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Verbatim</span>
                  <blockquote className="text-xs text-slate-600 italic border-l-2 border-blue-300 pl-3 leading-relaxed">
                    "{ref.paragraph_text}"
                  </blockquote>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PolicyCard({
  policy,
  onDelete,
}: {
  policy: Policy;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-0 shadow-sm overflow-hidden rounded-sm">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "oklch(0.93 0.018 248)" }}>
          <Shield className="w-5 h-5" style={{ color: "#0E6BAD" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{policy.name}</p>
            {policy.is_default && (
              <Badge variant="secondary" className="text-xs rounded-sm">Built-in</Badge>
            )}
            {policy.use_llm && (
              <Badge className="bg-purple-50 text-purple-700 border-0 text-xs rounded-sm">AI</Badge>
            )}
            {policy.source_url && (
              <Badge className="text-xs rounded-sm border-0" style={{ backgroundColor: "#f0f5fb", color: "#0E6BAD" }}>
                Imported
              </Badge>
            )}
            {policy.references.length > 0 && (
              <Badge className="text-xs rounded-sm border-0" style={{ backgroundColor: "#f0f5fb", color: "#0E6BAD" }}>
                {policy.references.length} legal ref{policy.references.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{policy.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs rounded-sm">
            {policy.pii_types.length} PII types
          </Badge>
          {!policy.is_default && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(policy.id); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-5 bg-slate-50 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Applies to
              </p>
              <div className="flex flex-wrap gap-1.5">
                {policy.doc_types.map((dt) => (
                  <Badge key={dt} variant="secondary" className="text-xs rounded-sm">
                    {DOC_TYPE_LABELS[dt]}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Settings
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Style: <b className="text-foreground">{REDACTION_STYLE_LABELS[policy.redaction_style] ?? policy.redaction_style}</b></div>
                <div>AI: <b className="text-foreground">{policy.use_llm ? "OpenAI enabled" : "Regex only"}</b></div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              PII Types Redacted ({policy.pii_types.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {policy.pii_types.map((pt) => (
                <span key={pt} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-sm">
                  {PII_TYPE_LABELS[pt]}
                </span>
              ))}
            </div>
          </div>

          <ReferenceTable refs={policy.references} />
        </div>
      )}
    </Card>
  );
}

function NewPolicyForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [docTypes, setDocTypes] = useState<Set<DocType>>(new Set(["general"]));
  const [piiTypes, setPiiTypes] = useState<Set<PIIType>>(
    new Set(["ssn", "account_number", "credit_card", "email", "phone"])
  );

  const createMut = useMutation({
    mutationFn: () =>
      createPolicy({
        name, description,
        doc_types: Array.from(docTypes),
        pii_types: Array.from(piiTypes),
        redaction_style: "black_box",
        mask_char: "*",
        visible_suffix: 4,
        use_llm: false,
        is_default: false,
        references: [],
        source_url: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy created");
      onClose();
    },
    onError: () => toast.error("Failed to create policy"),
  });

  const toggleDocType = (dt: DocType) =>
    setDocTypes((prev) => { const n = new Set(prev); n.has(dt) ? n.delete(dt) : n.add(dt); return n; });

  const togglePII = (pt: PIIType) =>
    setPiiTypes((prev) => { const n = new Set(prev); n.has(pt) ? n.delete(pt) : n.add(pt); return n; });

  return (
    <Card className="p-6 border-2 shadow-sm space-y-5 rounded-sm" style={{ borderColor: "#0E6BAD" }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">New Redaction Policy</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Policy Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mortgage Documents" />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Document Types</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_DOC_TYPES.map((dt) => (
            <button key={dt} onClick={() => toggleDocType(dt)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-all",
                docTypes.has(dt) ? "text-white border-blue-600" : "border-slate-200 text-muted-foreground hover:border-blue-300"
              )}
              style={docTypes.has(dt) ? { backgroundColor: "#0E6BAD" } : undefined}
            >
              {DOC_TYPE_LABELS[dt]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>PII Types to Redact</Label>
        <div className="grid grid-cols-3 gap-2">
          {ALL_PII.map((pt) => (
            <button key={pt} onClick={() => togglePII(pt)}
              className={cn(
                "text-xs px-2.5 py-1.5 rounded-lg border transition-all text-left",
                piiTypes.has(pt)
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "border-slate-200 text-muted-foreground hover:border-amber-200"
              )}
            >
              {PII_TYPE_LABELS[pt]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <Button
          className="text-white rounded-sm"
          style={{ backgroundColor: "#0E6BAD" }}
          disabled={!name || piiTypes.size === 0 || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          <Save className="w-4 h-4 mr-1.5" />
          {createMut.isPending ? "Saving…" : "Save Policy"}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

function ImportFromUrlForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [nameOverride, setNameOverride] = useState("");
  const [result, setResult] = useState<PolicyImportResult | null>(null);

  const importMut = useMutation({
    mutationFn: () => importPolicyFromUrl({ url, name_override: nameOverride || undefined }),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast.error(err.message ?? "Import failed"),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("No draft");
      return createPolicy(result.policy_draft);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy imported and saved");
      onClose();
    },
    onError: () => toast.error("Failed to save policy"),
  });

  return (
    <Card className="p-6 border-2 shadow-sm space-y-5 rounded-sm" style={{ borderColor: "#002A6B" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "#002A6B" }} />
          <h3 className="font-semibold">Import Policy from URL</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Paste a link to a regulatory document, compliance policy, or law. AI will extract the relevant PII types,
        document categories, and cite the specific sections that mandate redaction.
      </p>

      <div className="grid grid-cols-[1fr_200px] gap-3">
        <div className="space-y-1.5">
          <Label>Document URL</Label>
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/policy.pdf"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Policy name (optional)</Label>
          <Input
            value={nameOverride}
            onChange={(e) => setNameOverride(e.target.value)}
            placeholder="Override name…"
          />
        </div>
      </div>

      {!result && (
        <div className="flex gap-3">
          <Button
            className="text-white rounded-sm"
            style={{ backgroundColor: "#002A6B" }}
            disabled={!url.startsWith("http") || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1.5" /> Analyze &amp; Import</>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Source info */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-sm"
            style={{ backgroundColor: "oklch(0.93 0.018 248)" }}>
            {result.source_type === "pdf" ? (
              <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#0E6BAD" }} />
            ) : (
              <Globe className="w-4 h-4 flex-shrink-0" style={{ color: "#0E6BAD" }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{result.url}</p>
              <p className="text-xs text-muted-foreground">
                {result.source_type === "pdf" ? `PDF · ${result.pages_analyzed} pages analyzed` : `Web page · ${result.pages_analyzed} sections`}
              </p>
            </div>
          </div>

          {/* Excerpt */}
          {result.excerpt && (
            <div className="px-3 py-2 rounded-sm bg-slate-50 border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Document excerpt</p>
              <p className="text-xs text-slate-600 line-clamp-3 italic">{result.excerpt}</p>
            </div>
          )}

          {/* Draft preview */}
          <div className="rounded-sm border border-border overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#002A6B" }}>
              <Shield className="w-4 h-4 text-white" />
              <p className="text-sm font-bold text-white">{result.policy_draft.name}</p>
            </div>
            <div className="p-4 space-y-3 bg-white">
              <p className="text-xs text-muted-foreground">{result.policy_draft.description}</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Document Types</p>
                  <div className="flex flex-wrap gap-1">
                    {result.policy_draft.doc_types.map((dt) => (
                      <Badge key={dt} variant="secondary" className="text-xs rounded-sm">
                        {DOC_TYPE_LABELS[dt as DocType] ?? dt}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    PII to Redact ({result.policy_draft.pii_types.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.policy_draft.pii_types.map((pt) => (
                      <span key={pt} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                        {PII_TYPE_LABELS[pt as PIIType] ?? pt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Regulatory references from the draft */}
              <ReferenceTable refs={result.policy_draft.references as PolicyReference[]} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              className="text-white rounded-sm"
              style={{ backgroundColor: "#002A6B" }}
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saveMut.isPending ? "Saving…" : "Save Policy"}
            </Button>
            <Button variant="outline" onClick={() => setResult(null)}>Re-analyze</Button>
            <Button variant="ghost" onClick={onClose}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState<"none" | "new" | "import">("none");
  const [search, setSearch] = useState("");
  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: getPolicies,
  });

  const deleteMut = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy deleted");
    },
  });

  const q = search.toLowerCase().trim();
  const filtered = q
    ? policies.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.pii_types.some((t) => t.includes(q) || (PII_TYPE_LABELS[t] ?? "").toLowerCase().includes(q)) ||
        p.doc_types.some((t) => t.includes(q) || (DOC_TYPE_LABELS[t] ?? "").toLowerCase().includes(q)) ||
        p.references.some(
          (r) =>
            r.law_name.toLowerCase().includes(q) ||
            r.citation.toLowerCase().includes(q) ||
            r.section.toLowerCase().includes(q) ||
            r.key_point.toLowerCase().includes(q)
        )
      )
    : policies;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white border-b-2 px-8 py-4 flex items-center gap-4"
        style={{ borderBottomColor: "#002A6B" }}>
        <Link href="/">
          <Button variant="ghost" size="sm" className="rounded-sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Dashboard
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight">Redaction Policies</h1>
          <p className="text-xs text-muted-foreground">
            Manage document-type based PII redaction policies
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search policies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 w-56 text-sm rounded-sm"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-sm"
          style={{ borderColor: "#002A6B", color: "#002A6B" }}
          onClick={() => setShowForm(showForm === "import" ? "none" : "import")}
        >
          <Link2 className="w-4 h-4 mr-1.5" />
          Import from URL
        </Button>
        <Button
          size="sm"
          className="text-white rounded-sm"
          style={{ backgroundColor: "#0E6BAD" }}
          onClick={() => setShowForm(showForm === "new" ? "none" : "new")}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Policy
        </Button>
      </header>

      <div className="flex-1 px-8 py-6 max-w-4xl">
        <div className="space-y-4">
          {showForm === "new" && <NewPolicyForm onClose={() => setShowForm("none")} />}
          {showForm === "import" && <ImportFromUrlForm onClose={() => setShowForm("none")} />}

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-sm bg-slate-100 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && policies.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No policies yet</p>
              <p className="text-xs mt-1">Create your first redaction policy above</p>
            </div>
          )}

          {!isLoading && policies.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {search
                  ? `${filtered.length} of ${policies.length} polic${policies.length !== 1 ? "ies" : "y"} match`
                  : `${policies.length} polic${policies.length !== 1 ? "ies" : "y"}`}
              </p>
            </div>
          )}

          {!isLoading && filtered.length === 0 && policies.length > 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium text-sm">No policies match "{search}"</p>
              <button className="text-xs mt-1 underline" onClick={() => setSearch("")}>Clear search</button>
            </div>
          )}

          {filtered.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
