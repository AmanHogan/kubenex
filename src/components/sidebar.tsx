"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LuDatabase,
  LuSquareTerminal,
  LuNotebook,
  LuCalendarClock,
  LuServer,
  LuHouse,
  LuHistory,
  LuUpload,
  LuPanelLeftClose,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LuHouse;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Home", icon: LuHouse },
      { href: "/notebooks", label: "Workspace", icon: LuNotebook },
      { href: "/catalog", label: "Catalog", icon: LuDatabase },
      { href: "/jobs", label: "Jobs & Pipelines", icon: LuCalendarClock },
      { href: "/compute", label: "Compute", icon: LuServer },
    ],
  },
  {
    label: "SQL",
    items: [
      { href: "/sql", label: "SQL Editor", icon: LuSquareTerminal },
    ],
  },
  {
    label: "Data Engineering",
    items: [
      { href: "/runs", label: "Runs", icon: LuHistory },
      { href: "/ingest", label: "Data Ingestion", icon: LuUpload },
    ],
  },
];

/**
 * Overlay nav drawer — hamburger-toggled, slides in from left.
 * Matches the c4-diagram sidebar pattern: overlay with backdrop,
 * closes on link click or backdrop click.
 */
export function Sidebar(): React.JSX.Element {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-border bg-background text-foreground transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4">
          <Image
            src="/kubenex-logo-colored.svg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <p className="min-w-0 flex-1 truncate text-sm font-bold">Kubenex</p>
          <button
            type="button"
            title="Collapse sidebar"
            onClick={close}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LuPanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-5")}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active =
                    href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={`${gi}-${href}-${label}`}
                      href={href}
                      onClick={close}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="whitespace-nowrap">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
