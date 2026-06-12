"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal, Eye, Download, Trash2, FileText, RefreshCw,
  CheckCircle2, Clock, XCircle, AlertCircle, Search, Filter, X,
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

  const deleteMut = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const filtered = documents.filter((d) => {
    const matchSearch =
      !search ||
      d.filename.toLowerCase().includes(search.toLowerCase()) ||
      d.doc_type.includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPII = (d: DocumentRecord) => Object.values(d.pii_summary).reduce((a, b) => a + b, 0);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((d) => d.id))
    );
  };

  const clearSelection = () => setSelected(new Set());

  // Bulk actions — operate on all selected docs
  const bulkDelete = (ids: string[]) => {
    const count = ids.length;
    ids.forEach((id) => deleteMut.mutate(id));
    setSelected(new Set());
    toast.success(`${count} document${count !== 1 ? "s" : ""} deleted`);
  };

  const bulkDownload = (ids: string[]) => {
    const completedDocs = documents.filter((d) => ids.includes(d.id) && d.status === "completed");
    if (!completedDocs.length) {
      toast.error("No redacted documents in selection");
      return;
    }
    completedDocs.forEach((d) => downloadRedacted(d.id, d.filename));
    toast.success(`Downloading ${completedDocs.length} redacted file${completedDocs.length !== 1 ? "s" : ""}`);
  };

  // Whether a given row's menu should act on the whole selection or just itself
  const rowIsInSelection = (id: string) => selected.size > 1 && selected.has(id);

  const selectedDocs = documents.filter((d) => selected.has(d.id));
  const selectedCompleted = selectedDocs.filter((d) => d.status === "completed");

  return (
    <div className="bg-white rounded-sm shadow-sm border border-border overflow-hidden">

      {/* ── Bulk action bar — visible when rows are selected ── */}
      {selected.size > 0 && (
        <div className="px-5 py-3 flex items-center gap-3 border-b border-border"
          style={{ backgroundColor: "#002A6B" }}>
          <span className="text-sm font-semibold text-white">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-2">
            {selectedCompleted.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="rounded-sm h-7 text-xs font-medium bg-white/15 text-white hover:bg-white/25 border-0"
                onClick={() => bulkDownload(Array.from(selected))}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Redacted ({selectedCompleted.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="rounded-sm h-7 text-xs font-medium bg-red-500/80 text-white hover:bg-red-500 border-0"
              onClick={() => bulkDelete(Array.from(selected))}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete ({selected.size})
            </Button>
          </div>
          <button
            className="ml-auto text-white/60 hover:text-white transition-colors"
            onClick={clearSelection}
          >
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
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border" style={{ backgroundColor: "#002A6B" }}>
              <th className="pl-5 pr-2 py-3 text-left w-10"
                onClick={(e) => { e.stopPropagation(); toggleAll(); }}>
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length;
                  }}
                  readOnly
                  style={{ pointerEvents: "none" }}
                  className="rounded-sm border-slate-300"
                />
              </th>
              {["Actions", "Document", "Type", "Status", "PII Found", "Pages", "Date"].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-semibold text-white text-xs uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-4">
                      <div className="skeleton h-4 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No documents found</p>
                  <p className="text-xs mt-1">Upload a document to get started</p>
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((doc) => {
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
                    {/* Checkbox — td handles click to avoid double-toggle */}
                    <td
                      className="pl-5 pr-2 py-3.5"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        readOnly
                        style={{ pointerEvents: "none" }}
                        className="rounded-sm border-slate-300"
                      />
                    </td>

                    {/* Actions — selection-aware */}
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">

                          {/* Bulk mode header when multiple rows selected */}
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
                                onClick={() => bulkDelete(Array.from(selected))}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete {selected.size} documents
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                This document only
                              </div>
                            </>
                          )}

                          {/* Single-doc actions */}
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
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>

                    {/* Document */}
                    <td className="px-3 py-3.5">
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

                    {/* Type */}
                    <td className="px-3 py-3.5">
                      <Badge variant="secondary" className="text-xs font-normal rounded-sm">
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </Badge>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3.5">
                      <StatusBadge status={doc.status} />
                      {doc.error && (
                        <p className="text-xs text-red-500 mt-1 max-w-36 truncate" title={doc.error}>
                          {doc.error}
                        </p>
                      )}
                    </td>

                    {/* PII Found */}
                    <td className="px-3 py-3.5">
                      {totalPII(doc) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {totalPII(doc)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    {/* Pages */}
                    <td className="px-3 py-3.5 text-muted-foreground">
                      {doc.page_count || "—"}
                    </td>

                    {/* Date */}
                    <td className="px-3 py-3.5 pr-5 text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.created_at)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
