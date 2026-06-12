"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Shield, Upload, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StatsCards from "@/components/dashboard/stats-cards";
import DocumentTable from "@/components/dashboard/document-table";
import { getDocuments, getStats } from "@/lib/api";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 10_000,
  });

  const { data: documents = [], isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
    refetchInterval: 10_000,
  });

  const handleRefresh = () => {
    refetchStats();
    refetchDocs();
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Page header — JPMorgan style: white bar with deep navy accent line */}
      <header className="bg-white border-b-2 px-8 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderBottomColor: "#002A6B" }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Shield className="w-5 h-5" style={{ color: "#0E6BAD" }} />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Document Redaction Hub</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Secure PII redaction for banking and financial documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh}
            className="border-border text-foreground hover:border-primary rounded-sm">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Link href="/upload">
            <Button size="sm" className="text-white rounded-sm"
              style={{ backgroundColor: "#0E6BAD" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#0C5E99")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#0E6BAD")}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Upload Document
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex-1 px-8 py-6 space-y-6">
        {/* Stats */}
        <StatsCards stats={stats} loading={statsLoading} />

        {/* PII breakdown */}
        {stats && Object.keys(stats.pii_by_type).length > 0 && (
          <Card className="p-5 border-0 shadow-sm">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              PII Types Detected (All Time)
            </h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.pii_by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-sm"
                  >
                    <span className="text-xs font-medium text-amber-800 capitalize">
                      {type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* Document table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">All Documents</h2>
          </div>
          <DocumentTable documents={documents} loading={docsLoading} />
        </div>
      </div>
    </div>
  );
}
