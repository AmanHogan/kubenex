"use client";

import { createContext, useContext, useState } from "react";

interface SidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Shares the nav drawer's open/closed state between the header bar
 * (hamburger toggle) and the sidebar overlay.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const value: SidebarContextValue = {
    open,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}
