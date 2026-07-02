import { Outlet } from "react-router-dom";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";
import { UpdateNotifier } from "@/components/shared/UpdateNotifier";
import { useTiendanubeSync } from "@/hooks/useTiendanubeSync";

export function AppLayout() {
  useTiendanubeSync();

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <UpdateNotifier />
        <Topbar />
        <main className="flex-1 p-5 md:p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
