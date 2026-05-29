import { Outlet } from "react-router-dom";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
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