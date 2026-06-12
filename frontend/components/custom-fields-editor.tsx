"use client";
import { Plus, Trash2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomField, RedactionStyle } from "@/lib/types";

export type { CustomField };

const STYLE_OPTIONS: { value: RedactionStyle; label: string }[] = [
  { value: "black_box", label: "Black Box" },
  { value: "label",     label: "Label [TAG]" },
  { value: "asterisk",  label: "Asterisk ••••" },
  { value: "last_four", label: "Last 4 ****1234" },
  { value: "x_mask",    label: "X-Mask XXXX" },
];

const TEMPLATES: Omit<CustomField, "_id">[] = [
  { name: "Employee Badge",  pattern: "BADGE-\\d{6}",      is_regex: true,  redaction_style: "black_box", mask_char: "*", visible_suffix: 4 },
  { name: "Order Number",    pattern: "ORD-\\d{8}",        is_regex: true,  redaction_style: "label",     mask_char: "*", visible_suffix: 4 },
  { name: "Case ID",         pattern: "CASE-\\d{5,}",      is_regex: true,  redaction_style: "label",     mask_char: "*", visible_suffix: 4 },
  { name: "Internal Ref",    pattern: "REF-[A-Z0-9]{6,}",  is_regex: true,  redaction_style: "asterisk",  mask_char: "*", visible_suffix: 4 },
  { name: "Loan ID",         pattern: "LN-\\d{10}",        is_regex: true,  redaction_style: "last_four", mask_char: "*", visible_suffix: 4 },
];

interface Props {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function CustomFieldsEditor({ fields, onChange }: Props) {
  const add = (template?: Omit<CustomField, "_id">) => {
    onChange([
      ...fields,
      {
        _id: uid(),
        name: template?.name ?? "Custom Field",
        pattern: template?.pattern ?? "",
        is_regex: template?.is_regex ?? true,
        redaction_style: template?.redaction_style ?? "black_box",
        mask_char: template?.mask_char ?? "*",
        visible_suffix: template?.visible_suffix ?? 4,
      },
    ]);
  };

  const remove = (id: string) => onChange(fields.filter((f) => f._id !== id));

  const update = (id: string, patch: Partial<CustomField>) =>
    onChange(fields.map((f) => (f._id === id ? { ...f, ...patch } : f)));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Custom Fields
          </span>
          {fields.length > 0 && (
            <span className="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 leading-none">
              {fields.length}
            </span>
          )}
        </div>
        <button
          onClick={() => add()}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* Field rows */}
      {fields.length > 0 && (
        <div className="space-y-2 mb-2">
          {fields.map((f) => (
            <div
              key={f._id}
              className="rounded-sm border border-border bg-slate-50 p-2 space-y-1.5"
            >
              {/* Row 1: name + delete */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Field name"
                  value={f.name}
                  onChange={(e) => update(f._id!, { name: e.target.value })}
                  className="flex-1 text-xs border border-border rounded-sm px-2 py-1 bg-white min-w-0"
                />
                <button
                  onClick={() => remove(f._id!)}
                  className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 2: pattern + regex toggle */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={f.is_regex ? "Regex: \\d{9}" : "Keyword: CONFIDENTIAL"}
                  value={f.pattern}
                  onChange={(e) => update(f._id!, { pattern: e.target.value })}
                  className="flex-1 text-xs font-mono border border-border rounded-sm px-2 py-1 bg-white min-w-0"
                />
                <button
                  onClick={() => update(f._id!, { is_regex: !f.is_regex })}
                  className={cn(
                    "flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-sm border transition-colors",
                    f.is_regex
                      ? "bg-purple-50 border-purple-200 text-purple-700"
                      : "bg-slate-100 border-slate-200 text-slate-500"
                  )}
                  title={f.is_regex ? "Switch to plain keyword" : "Switch to regex"}
                >
                  {f.is_regex ? ".*" : "Aa"}
                </button>
              </div>

              {/* Row 3: style */}
              <select
                value={f.redaction_style}
                onChange={(e) => update(f._id!, { redaction_style: e.target.value as RedactionStyle })}
                className="w-full text-xs border border-border rounded-sm px-2 py-1 bg-white"
              >
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Row 4: mask char + suffix (conditional) */}
              {(f.redaction_style === "asterisk" || f.redaction_style === "last_four") && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-16 flex-shrink-0">Mask char</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={f.mask_char}
                    onChange={(e) => update(f._id!, { mask_char: e.target.value || "*" })}
                    className="w-8 text-center text-xs border border-border rounded-sm px-1 py-1 bg-white"
                  />
                  {f.redaction_style === "last_four" && (
                    <>
                      <label className="text-xs text-muted-foreground">Keep last</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={f.visible_suffix}
                        onChange={(e) => update(f._id!, { visible_suffix: Math.max(1, Math.min(8, Number(e.target.value))) })}
                        className="w-8 text-center text-xs border border-border rounded-sm px-1 py-1 bg-white"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick templates */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Quick templates:</p>
        <div className="flex flex-wrap gap-1">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => add(t)}
              className="text-xs px-2 py-0.5 rounded-sm border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              + {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
