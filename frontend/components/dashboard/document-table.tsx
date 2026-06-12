"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal, Eye, Download, Trash2, FileText, RefreshCw,
  CheckCircle2, Clock, XCircle, AlertCircle, Search, Filter, X,
  Settings2, ChevronUp, ChevronDown, GripVertical, ChevronsUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { deleteDocument, downloadRedacted } from "@/lib/api";
import type { DocumentRecord, DocumentStatus } from "@/lib/types";
import { DOC_TYPE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  uploaded: { label: "Uploaded", icon: Clock, className: "bg-slate-100 text-slate-600" },
  processing: { label: "Processing", icon: RefreshCw, className: "bg-blue-100 text-blue-700" },
  completed: { label: "Redacted", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", icon: XCircle, className: "bg-red-100 text-red-700" },
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, icon: Icon, className } = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm", className)}>
      <Icon className={cn("w-3 h-3", status === "processing" && "animate-spin")} />
      {label}
    </span>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Column definitions ──────────────────────────────────────────────────────

type ColId = "actions" | "document" | "type" | "status" | "pii_found" | "tokens" | "ai_cost" | "pages" | "date";
type SortDir = "asc" | "desc";

interface ColDef {
  id: ColId;
  label: string;
  sortKey?: keyof DocumentRecord | "pii_found";
  canHide?: boolean;  // false = always visible
}

const COLUMN_DEFS: ColDef[] = [
  { id: "actions",   label: "Actions",   canHide: false },
  { id: "document",  label: "Document",  sortKey: "filename" },
  { id: "type",      label: "Type",      sortKey: "doc_type" },
  { id: "status",    label: "Status",    sortKey: "status" },
  { id: "pii_found", label: "PII Found", sortKey: "pii_found" },
  { id: "tokens",    label: "Tokens",    sortKey: "tokens_used" },
  { id: "ai_cost",   label: "AI Cost",   sortKey: "redaction_cost" },
  { id: "pages",     label: "Pages",     sortKey: "page_count" },
  { id: "date",      label: "Date",      sortKey: "created_at" },
];

const DEFAULT_ORDER: ColId[] = COLUMN_DEFS.map((c) => c.id);
const DEFAULT_VISIBLE = new Set<ColId>(DEFAULT_ORDER);

function totalPII(d: DocumentRecord) {
  return Object.values(d.pii_summary).reduce((a, b) => a + b, 0);
}

// ── Column settings panel ───────────────────────────────────────────────────

function ColumnSettings({
  order,
  visible,
  onToggle,
  onReorder,
  onReset,
}: {
  order: ColId[];
  visible: Set<ColId>;
  onToggle: (id: ColId) => void;
  onReorder: (newOrder: ColId[]) => void;
  onReset: () => void;
}) {
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOver.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    if (dragItem.current === dragOver.current) return;
    const next = [...order];
    const [moved] = next.splice(dragItem.current, 1);
    next.splice(dragOver.current, 0, moved);
    dragItem.current = null;
    dragOver.current = null;
    onReorder(next);
  };

  return (
    <div className="w-56 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Columns</p>
        <button onClick={onReset} className="text-xs text-blue-600 hover:text-blue-800">Reset</button>
      </div>
      <div className="space-y-0.5">
        {order.map((id, idx) => {
          const col = COLUMN_DEFS.find((c) => c.id === id)!;
          const isFixed = col.canHide === false;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-sm hover:bg-slate-50 cursor-grab active:cursor-grabbing group"
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
              <div
                className="w-4 h-4 rounded-sm border-2 flex-shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: visible.has(id) ? "#0E6BAD" : "transparent",
                  borderColor: visible.has(id) ? "#0E6BAD" : (isFixed ? "#cbd5e1" : "#94a3b8"),
                  opacity: isFixed ? 0.5 : 1,
                  cursor: isFixed ? "not-allowed" : "pointer",
                }}
                onClick={() => { if (!isFixed) onToggle(id); }}
              >
                {visible.has(id) && (
                  <svg viewBox="0 0 10 8" className="w-2 h-2">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <span
                className={cn("text-xs flex-1", visible.has(id) ? "text-foreground" : "text-muted-foreground")}
                onClick={() => { if (!isFixed) onToggle(id); }}
                style={{ cursor: isFixed ? "default" : "pointer" }}
              >
                {col.label}
              </span>
              {isFixed && <span className="text-xs text-slate-300">fixed</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sortable header cell ────────────────────────────────────────────────────

function SortableTh({
  col, sortCol, sortDir, onSort,
}: {
  col: ColDef;
  sortCol: ColId | null;
  sortDir: SortDir;
  onSort: (id: ColId) => void;
}) {
  const active = sortCol === col.id;
  return (
    <th
      className={cn(
        "px-3 py-3 text-left font-semibold text-white text-xs uppercase tracking-wider",
        col.sortKey && "select-none",
        col.sortKey && "cursor-pointer hover:bg-white/10 transition-colors"
      )}
      onClick={() => { if (col.sortKey) onSort(col.id); }}
    >
      <div className="flex items-center gap-1">
        <span>{col.label}</span>
        {col.sortKey && (
          <span className="flex-shrink-0">
            {active ? (
              sortDir === "asc"
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronsUpDown className="w-3 h-3 opacity-30" />
            )}
          </span>
        )}
      </div>
    </th>
  );
}

// ── Main table ──────────────────────────────────────────────────────────────

interface Props {
  documents: DocumentRecord[];
  loading: boolean;
}

export default function DocumentTable({ documents, loading }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Column state
  const [colOrder, setColOrder] = useState<ColId[]>(DEFAULT_ORDER);
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(new Set(DEFAULT_VISIBLE));
  const [showColSettings, setShowColSettings] = useState(false);

  // Sort state
  const [sortCol, setSortCol] = useState<ColId | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const deleteMut = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  // Filter
  const filtered = documents.filter((d) => {
    const matchSearch =
      !search ||
      d.filename.toLowerCase().includes(search.toLowerCase()) ||
      d.doc_type.includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    const col = COLUMN_DEFS.find((c) => c.id === sortCol);
    if (!col?.sortKey) return 0;
    let aVal: string | number, bVal: string | number;
    if (col.sortKey === "pii_found") {
      aVal = totalPII(a); bVal = totalPII(b);
    } else {
      aVal = (a[col.sortKey as keyof DocumentRecord] as string | number) ?? "";
      bVal = (b[col.sortKey as keyof DocumentRecord] as string | number) ?? "";
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = useCallback((id: ColId) => {
    setSortCol((prev) => {
      if (prev === id) {
        setSortDir((d) => d === "asc" ? "desc" : "asc");
        return id;
      }
      setSortDir("asc");
      return id;
    });
  }, []);

  const toggleVisible = (id: ColId) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resetColumns = () => {
    setColOrder(DEFAULT_ORDER);
    setVisibleCols(new Set(DEFAULT_VISIBLE));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === sorted.length ? new Set() : new Set(sorted.map((d) => d.id))
    );
  };

  const clearSelection = () => setSelected(new Set());

  const bulkDelete = (ids: string[]) => {
    const count = ids.length;
    ids.forEach((id) => deleteMut.mutate(id));
    setSelected(new Set());
    toast.success(`${count} document${count !== 1 ? "s" : ""} deleted`);
  };

  const bulkDownload = (ids: string[]) => {
    const completedDocs = documents.filter((d) => ids.includes(d.id) && d.status === "completed");
    if (!completedDocs.length) { toast.error("No redacted documents in selection"); return; }
    completedDocs.forEach((d) => downloadRedacted(d.id, d.filename));
    toast.success(`Downloading ${completedDocs.length} redacted file${completedDocs.length !== 1 ? "s" : ""}`);
  };

  const rowIsInSelection = (id: string) => selected.size > 1 && selected.has(id);
  const selectedDocs = documents.filter((d) => selected.has(d.id));
  const selectedCompleted = selectedDocs.filter((d) => d.status === "completed");

  // Ordered visible cols (excluding checkbox col which is always fixed-left)
  const activeCols = colOrder
    .map((id) => COLUMN_DEFS.find((c) => c.id === id)!)
    .filter((c) => visibleCols.has(c.id));

  const totalColCount = 1 + activeCols.length; // +1 for checkbox

  return (
    <div className="bg-white rounded-sm shadow-sm border border-border overflow-hidden">

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="px-5 py-3 flex items-center gap-3 border-b border-border"
          style={{ backgroundColor: "#002A6B" }}>
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            {selectedCompleted.length > 0 && (
              <Button size="sm" variant="secondary"
                className="rounded-sm h-7 text-xs font-medium bg-white/15 text-white hover:bg-white/25 border-0"
                onClick={() => bulkDownload(Array.from(selected))}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Redacted ({selectedCompleted.length})
              </Button>
            )}
            <Button size="sm" variant="secondary"
              className="rounded-sm h-7 text-xs font-medium bg-red-500/80 text-white hover:bg-red-500 border-0"
              onClick={() => bulkDelete(Array.from(selected))}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete ({selected.size})
            </Button>
          </div>
          <button className="ml-auto text-white/60 hover:text-white transition-colors" onClick={clearSelection}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Search / filter toolbar ── */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm rounded-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-36 h-9 text-sm rounded-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Redacted</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {/* Column settings */}
        <DropdownMenu open={showColSettings} onOpenChange={setShowColSettings}>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border border-border rounded-sm bg-white hover:bg-accent transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Columns
            {visibleCols.size < DEFAULT_VISIBLE.size && (
              <span className="ml-1 bg-blue-600 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center font-bold">
                {DEFAULT_VISIBLE.size - visibleCols.size}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-0">
            <ColumnSettings
              order={colOrder}
              visible={visibleCols}
              onToggle={toggleVisible}
              onReorder={setColOrder}
              onReset={resetColumns}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground">
          {sorted.length} document{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border" style={{ backgroundColor: "#002A6B" }}>
              {/* Fixed checkbox col */}
              <th className="pl-5 pr-2 py-3 text-left w-10"
                onClick={(e) => { e.stopPropagation(); toggleAll(); }}>
                <input
                  type="checkbox"
                  checked={selected.size === sorted.length && sorted.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.size > 0 && selected.size < sorted.length;
                  }}
                  readOnly
                  style={{ pointerEvents: "none" }}
                  className="rounded-sm border-slate-300"
                />
              </th>
              {activeCols.map((col) => (
                <SortableTh key={col.id} col={col} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: totalColCount }).map((_, j) => (
                    <td key={j} className="px-3 py-4">
                      <div className="h-4 rounded w-full bg-slate-100 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={totalColCount} className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No documents found</p>
                  <p className="text-xs mt-1">Upload a document to get started</p>
                </td>
              </tr>
            )}
            {!loading &&
              sorted.map((doc) => {
                const inSelection = rowIsInSelection(doc.id);
                return (
                  <tr
                    key={doc.id}
                    className={cn(
                      "transition-colors cursor-pointer",
                      selected.has(doc.id) ? "bg-blue-50" : "hover:bg-slate-50"
                    )}
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    {/* Fixed checkbox */}
                    <td className="pl-5 pr-2 py-3.5"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}>
                      <input type="checkbox" checked={selected.has(doc.id)} readOnly
                        style={{ pointerEvents: "none" }} className="rounded-sm border-slate-300" />
                    </td>

                    {/* Dynamic columns */}
                    {activeCols.map((col) => {
                      if (col.id === "actions") return (
                        <td key="actions" className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              {inSelection && (
                                <>
                                  <div className="px-2 py-1.5 text-xs font-semibold" style={{ color: "#0E6BAD" }}>
                                    Applies to {selected.size} selected
                                  </div>
                                  <DropdownMenuSeparator />
                                  {selectedCompleted.length > 0 && (
                                    <DropdownMenuItem onClick={() => bulkDownload(Array.from(selected))}>
                                      <Download className="w-4 h-4 mr-2" />
                                      Download Redacted ({selectedCompleted.length})
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => bulkDelete(Array.from(selected))}>
                                    <Trash2 className="w-4 h-4 mr-2" />Delete {selected.size} documents
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <div className="px-2 py-1 text-xs text-muted-foreground">This document only</div>
                                </>
                              )}
                              <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}`)}>
                                <Eye className="w-4 h-4 mr-2" /> View / Compare
                              </DropdownMenuItem>
                              {doc.status === "completed" && (
                                <DropdownMenuItem onClick={() => downloadRedacted(doc.id, doc.filename)}>
                                  <Download className="w-4 h-4 mr-2" /> Download Redacted
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  deleteMut.mutate(doc.id);
                                  setSelected((prev) => { const n = new Set(prev); n.delete(doc.id); return n; });
                                  toast.success("Document deleted");
                                }}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      );
                      if (col.id === "document") return (
                        <td key="document" className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-red-50 border border-red-100 rounded-sm flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-red-500" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground truncate max-w-52">{doc.filename}</p>
                              <p className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</p>
                            </div>
                          </div>
                        </td>
                      );
                      if (col.id === "type") return (
                        <td key="type" className="px-3 py-3.5">
                          <Badge variant="secondary" className="text-xs font-normal rounded-sm">
                            {DOC_TYPE_LABELS[doc.doc_type]}
                          </Badge>
                        </td>
                      );
                      if (col.id === "status") return (
                        <td key="status" className="px-3 py-3.5">
                          <StatusBadge status={doc.status} />
                          {doc.error && (
                            <p className="text-xs text-red-500 mt-1 max-w-36 truncate" title={doc.error}>
                              {doc.error}
                            </p>
                          )}
                        </td>
                      );
                      if (col.id === "pii_found") return (
                        <td key="pii_found" className="px-3 py-3.5">
                          {totalPII(doc) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {totalPII(doc)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      );
                      if (col.id === "tokens") return (
                        <td key="tokens" className="px-3 py-3.5">
                          {doc.tokens_used > 0 ? (
                            <span className="text-xs font-semibold text-blue-700">
                              {doc.tokens_used.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                      if (col.id === "ai_cost") return (
                        <td key="ai_cost" className="px-3 py-3.5">
                          {doc.redaction_cost > 0 ? (
                            <span className="text-xs font-semibold text-emerald-700">
                              ${doc.redaction_cost < 0.001
                                ? doc.redaction_cost.toFixed(6)
                                : doc.redaction_cost.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                      if (col.id === "pages") return (
                        <td key="pages" className="px-3 py-3.5 text-muted-foreground">
                          {doc.page_count || "—"}
                        </td>
                      );
                      if (col.id === "date") return (
                        <td key="date" className="px-3 py-3.5 pr-5 text-muted-foreground whitespace-nowrap">
                          {formatDate(doc.created_at)}
                        </td>
                      );
                      return null;
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
