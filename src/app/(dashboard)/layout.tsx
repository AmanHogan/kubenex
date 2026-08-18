import { Sidebar } from "@/components/sidebar";
import { HeaderBar } from "@/components/header-bar";
import { PageGlow } from "@/components/page-glow";
import { SidebarProvider } from "@/lib/sidebar-context";

/**
 * Dashboard shell — header bar + overlay sidebar + scrollable content.
 * No fixed sidebar reserving layout space; sidebar slides in from
 * hamburger toggle, just like the c4-diagram dashboard.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <PageGlow />
        <Sidebar />
        <HeaderBar />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
