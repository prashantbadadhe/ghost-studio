"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, Settings, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload & Redact", icon: Upload },
  { href: "/settings", label: "Policies", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-screen sticky top-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {/* JPMorgan Chase octagon mark */}
          <div className="relative w-9 h-9 flex-shrink-0">
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9">
              <polygon
                points="10,2 26,2 34,10 34,26 26,34 10,34 2,26 2,10"
                fill="#0E6BAD"
              />
              <text x="18" y="23" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">
                JP
              </text>
            </svg>
          </div>
          <div>
            <p className="font-bold text-white text-sm tracking-wide">Ghost Studio</p>
            <p className="text-xs text-slate-400 tracking-wide">by JPMorgan Chase</p>
          </div>
        </div>
      </div>

      {/* Enterprise badge */}
      <div className="px-5 py-3 border-b border-sidebar-border">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm"
          style={{ backgroundColor: "oklch(0.28 0.06 261)", color: "oklch(0.75 0.05 248)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#0E6BAD" }} />
          Banking &amp; Financial Services
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all group rounded-sm",
                active
                  ? "text-white"
                  : "text-slate-400 hover:bg-sidebar-accent hover:text-white"
              )}
              style={active ? { backgroundColor: "#0E6BAD" } : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* JPMorgan footer branding */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-sm flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: "#0E6BAD" }}
          >
            GS
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">Ghost Studio</p>
            <p className="text-xs text-slate-500">JPMorgan Chase &amp; Co.</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
