"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { GlobalRole } from "@/lib/types";

const TABS = [
  {
    href: "/",
    label: "Dashboard",
    match: (path: string) => path === "/" || path.startsWith("/hypcheck"),
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2.5 8.5L8 3l5.5 5.5M4 7.5V13h8V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    show: () => true,
  },
  {
    href: "/new",
    label: "New",
    match: (path: string) => path.startsWith("/new"),
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    show: (role: GlobalRole) => role !== "member",
  },
  {
    href: "/admin",
    label: "Admin",
    match: (path: string) => path.startsWith("/admin"),
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 14c.7-2.8 2.9-4.5 5.5-4.5s4.8 1.7 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    show: (role: GlobalRole) => role === "admin",
  },
] as const;

/**
 * The thumb-reachable replacement for the sidebar below `md` — same three
 * destinations, same role gating, no hamburger hiding the console away. The
 * per-hypcheck switcher list stays sidebar-only; the dashboard card grid
 * already does that job one tap away.
 */
export function MobileNav({ role }: { role: GlobalRole }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => t.show(role));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-edge bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors ${
              active ? "text-iris" : "text-ink-faint"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
