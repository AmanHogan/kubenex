"use client";

import Image from "next/image";
import Link from "next/link";
import { LuMenu, LuPlus } from "react-icons/lu";
import { useSidebar } from "@/lib/sidebar-context";

/**
 * Dashboard top bar: hamburger + brand on left, "New" button on right.
 * Matches the c4-diagram HeaderBar pattern.
 */
export function HeaderBar(): React.JSX.Element {
  const { toggle } = useSidebar();

  return (
    <header className="grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-border bg-background px-6">
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          title="Toggle sidebar"
          onClick={toggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LuMenu className="h-5 w-5" />
        </button>
        <Link href="/" title="Kubenex" className="flex shrink-0 items-center gap-2">
          <Image
            src="/kubenex-logo-colored.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <span className="text-sm font-bold">Kubenex</span>
        </Link>
      </div>

      <div />

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/ingest"
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <LuPlus className="h-4 w-4" />
          New
        </Link>
      </div>
    </header>
  );
}
