"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Copy, CheckCheck, ShieldCheck, Cpu, Settings2,
  ChevronDown, ChevronUp, Loader2, Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { redactText } from "@/lib/api";
import { PII_TYPE_LABELS, REDACTION_STYLE_LABELS, type PIIType, type RedactionStyle, type CustomField } from "@/lib/types";
import CustomFieldsEditor from "@/components/custom-fields-editor";
import { cn } from "@/lib/utils";
import Link from "next/link";

const ALL_PII: PIIType[] = [
  "ssn", "account_number", "routing_number", "credit_card",
  "email", "phone", "dob", "passport", "drivers_license",
  "name", "address", "ip_address", "iban", "swift", "tax_id", "employee_id",
];

// black_box is PDF-only (draws a rectangle); text redaction uses the other 4 styles
const STYLES: RedactionStyle[] = ["label", "asterisk", "last_four", "x_mask"];

export default function TextRedactPage() {
  const [inputText, setInputText] = useState("");
  const [redactedText, setRedactedText] = useState("");
  const [findings, setFindings] = useState<{ pii_type: string; value: string; method: string }[]>([]);
  const [copied, setCopied] = useState(false);

  const [selectedPII, setSelectedPII] = useState<Set<PIIType>>(
    new Set(["ssn", "account_number", "routing_number", "credit_card", "email", "phone", "dob"])
  );
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>("label");
  const [maskChar, setMaskChar] = useState("*");
  const [visibleSuffix, setVisibleSuffix] = useState(4);
  const [useLLM, setUseLLM] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showAllPII, setShowAllPII] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  const redactMut = useMutation({
    mutationFn: () =>
      redactText({
        text: inputText,
        pii_types: Array.from(selectedPII),
        redaction_style: redactionStyle,
        mask_char: maskChar,
        visible_suffix: visibleSuffix,
        use_llm: useLLM,
        custom_fields: customFields.map(({ _id, ...cf }) => cf),
      }),
    onSuccess: (data) => {
      setRedactedText(data.redacted_text);
      setFindings(data.findings);
      toast.success(`${data.findings.length} PII instance${data.findings.length !== 1 ? "s" : ""} redacted`);
    },
    onError: () => toast.error("Redaction failed"),
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(redactedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const togglePII = (pt: PIIType) =>
    setSelectedPII((prev) => { const n = new Set(prev); n.has(pt) ? n.delete(pt) : n.add(pt); return n; });

  const visiblePII = showAllPII ? ALL_PII : ALL_PII.slice(0, 10);
  const isDone = findings.length > 0 || redactedText !== inputText;

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
          <h1 className="text-lg font-bold tracking-tight">Text Redaction</h1>
          <p className="text-xs text-muted-foreground">Paste text, redact PII, copy the result</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-sm"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 className="w-3.5 h-3.5 mr-1.5" />
          Settings
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: input + output ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Input */}
          <div className="flex-1 flex flex-col border-b border-border min-h-0">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-border flex-shrink-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Text</span>
              <div className="flex items-center gap-2">
                {inputText && (
                  <span className="text-xs text-muted-foreground">{inputText.length} chars</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs rounded-sm"
                  onClick={() => { setInputText(""); setRedactedText(""); setFindings([]); }}
                >
                  <Eraser className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
            </div>
            <textarea
              className="flex-1 w-full resize-none p-4 text-sm font-mono bg-white outline-none placeholder:text-muted-foreground"
              placeholder={"Paste text containing PII here…\n\nExamples:\n  SSN: 123-45-6789\n  Account: 9876543210\n  Card: 4111 1111 1111 1111\n  Email: john.doe@example.com"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          {/* Output */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ backgroundColor: "#002A6B" }}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Redacted Text</span>
                {findings.length > 0 && (
                  <Badge className="text-xs border-0 ml-1" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "white" }}>
                    {findings.length} PII found
                  </Badge>
                )}
              </div>
              {redactedText && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-white hover:bg-white/20 rounded-sm"
                  onClick={handleCopy}
                >
                  {copied
                    ? <><CheckCheck className="w-3.5 h-3.5 mr-1" /> Copied!</>
                    : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50">
              {redactedText ? (
                <pre className="text-sm font-mono whitespace-pre-wrap text-foreground leading-relaxed">
                  {redactedText}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>Redacted output will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: settings + redact button ── */}
        {showSettings && (
          <div className="w-72 flex-shrink-0 flex flex-col bg-white border-l border-border overflow-hidden">
            <div className="flex-1 overflow-y-auto">

              {/* PII Types */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PII Types</p>
                  <div className="flex gap-1 text-xs">
                    <button className="text-muted-foreground hover:text-foreground px-1"
                      onClick={() => setSelectedPII(new Set(ALL_PII))}>All</button>
                    <span className="text-muted-foreground">·</span>
                    <button className="text-muted-foreground hover:text-foreground px-1"
                      onClick={() => setSelectedPII(new Set())}>None</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {visiblePII.map((pt) => (
                    <button key={pt} onClick={() => togglePII(pt)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-all text-left",
                        selectedPII.has(pt) ? "bg-slate-50 text-foreground" : "text-muted-foreground hover:bg-slate-50"
                      )}
                    >
                      <div className="w-3.5 h-3.5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: selectedPII.has(pt) ? "#0E6BAD" : "transparent", borderColor: selectedPII.has(pt) ? "#0E6BAD" : "#cbd5e1" }}>
                        {selectedPII.has(pt) && (
                          <svg viewBox="0 0 10 8" className="w-2 h-2">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 truncate">{PII_TYPE_LABELS[pt]}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAllPII(!showAllPII)}
                  className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full justify-center py-1">
                  {showAllPII
                    ? <><ChevronUp className="w-3 h-3" /> Show less</>
                    : <><ChevronDown className="w-3 h-3" /> +{ALL_PII.length - 10} more</>}
                </button>
              </div>

              {/* Redaction Style */}
              <div className="p-4 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Redaction Style</p>
                <div className="space-y-1.5">
                  {STYLES.map((s) => (
                    <button key={s} onClick={() => setRedactionStyle(s)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-sm border text-left text-xs transition-all",
                        redactionStyle === s ? "border-blue-300 text-blue-900" : "border-slate-200 text-muted-foreground hover:border-blue-200 hover:bg-slate-50"
                      )}
                      style={redactionStyle === s ? { backgroundColor: "oklch(0.93 0.018 248)" } : undefined}
                    >
                      <div className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: redactionStyle === s ? "#0E6BAD" : "#cbd5e1" }}>
                        {redactionStyle === s && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0E6BAD" }} />}
                      </div>
                      <span className="font-medium">{REDACTION_STYLE_LABELS[s]}</span>
                    </button>
                  ))}
                </div>

                {(redactionStyle === "asterisk" || redactionStyle === "last_four") && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-muted-foreground w-16">Mask char</label>
                      <input type="text" maxLength={1} value={maskChar}
                        onChange={(e) => setMaskChar(e.target.value || "*")}
                        className="w-10 text-center text-sm border border-border rounded-sm px-2 py-1 bg-white" />
                    </div>
                    {redactionStyle === "last_four" && (
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-semibold text-muted-foreground w-16">Keep last</label>
                        <input type="number" min={1} max={8} value={visibleSuffix}
                          onChange={(e) => setVisibleSuffix(Math.max(1, Math.min(8, Number(e.target.value))))}
                          className="w-10 text-center text-sm border border-border rounded-sm px-2 py-1 bg-white" />
                        <span className="text-xs text-muted-foreground">digits</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI toggle */}
              <div className="p-4">
                <button onClick={() => setUseLLM(!useLLM)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-sm border-2 transition-all text-left",
                    useLLM ? "border-blue-300" : "border-slate-200 hover:border-blue-200"
                  )}
                  style={useLLM ? { backgroundColor: "oklch(0.93 0.018 248)" } : undefined}
                >
                  <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: useLLM ? "#0E6BAD" : "#e2e8f0" }}>
                    <Cpu className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold">AI Detection</p>
                    <p className="text-xs text-muted-foreground">
                      {useLLM ? "On — GPT-4o-mini" : "Off — regex only"}
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

            {/* Custom Fields */}
            <div className="p-4 border-t border-border">
              <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
            </div>

            {/* Findings summary */}
            {findings.length > 0 && (
              <div className="border-t border-border p-4 bg-amber-50 flex-shrink-0">
                <p className="text-xs font-semibold text-amber-800 mb-2">{findings.length} PII instances found</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {findings.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-amber-800 truncate max-w-28">{f.value}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-amber-600 font-medium">{f.pii_type.replace(/_/g, " ")}</span>
                        <span className="text-amber-400 text-xs">{f.method}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Redact button */}
            <div className="flex-shrink-0 p-4 border-t border-border bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
              <Button
                className="w-full text-white rounded-sm h-10 text-sm font-semibold"
                style={{ backgroundColor: "#0E6BAD" }}
                disabled={!inputText.trim() || selectedPII.size === 0 || redactMut.isPending}
                onClick={() => redactMut.mutate()}
              >
                {redactMut.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redacting…</>
                  : <><ShieldCheck className="w-4 h-4 mr-2" /> Redact Text</>}
              </Button>
              {!inputText.trim() && (
                <p className="text-xs text-center text-muted-foreground mt-2">Paste text above to enable</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
