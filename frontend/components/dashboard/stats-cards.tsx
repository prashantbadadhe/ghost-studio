"use client";
import { FileText, ShieldCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Stats } from "@/lib/types";

interface Props {
  stats: Stats | undefined;
  loading: boolean;
}

const CARDS = [
  {
    key: "total_documents" as keyof Stats,
    label: "Total Documents",
    icon: FileText,
    color: "text-white",
    bg: "",
    bgStyle: { backgroundColor: "#0E6BAD" },
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "redacted_today" as keyof Stats,
    label: "Redacted Today",
    icon: ShieldCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    bgStyle: undefined,
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "total_pii_found" as keyof Stats,
    label: "PII Instances Found",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    bgStyle: undefined,
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "compliance_rate" as keyof Stats,
    label: "Compliance Rate",
    icon: TrendingUp,
    color: "text-white",
    bg: "",
    bgStyle: { backgroundColor: "#002A6B" },
    format: (v: number) => `${v}%`,
  },
];

export default function StatsCards({ stats, loading }: Props) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, color, bg, bgStyle, format }) => (
        <Card key={key} className="p-5 border-0 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                {label}
              </p>
              {loading ? (
                <div className="skeleton h-8 w-20 rounded mt-1" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {stats ? format(stats[key] as number) : "—"}
                </p>
              )}
            </div>
            <div className={`${bg} p-2.5 rounded-sm`} style={bgStyle}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
