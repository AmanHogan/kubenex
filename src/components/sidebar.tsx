"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuDatabase,
  LuSquareTerminal,
  LuNotebook,
  LuCalendarClock,
  LuServer,
  LuLayoutDashboard,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LuLayoutDashboard },
  { href: "/sql", label: "SQL Editor", icon: LuSquareTerminal },
  { href: "/notebooks", label: "Notebooks", icon: LuNotebook },
  { href: "/catalog", label: "Data Catalog", icon: LuDatabase },
  { href: "/jobs", label: "Jobs", icon: LuCalendarClock },
  { href: "/compute", label: "Compute", icon: LuServer },
] as const;

/**
 * Fixed left sidebar — matches the homelab-ui-kit design tokens.
 * Active route gets primary-blue background tint + foreground text.
 */
export function Sidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          K
        </div>
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Kubenex
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[11px] text-muted-foreground">
          k3s · data-platform
        </p>
      </div>
    </aside>
  );
}
