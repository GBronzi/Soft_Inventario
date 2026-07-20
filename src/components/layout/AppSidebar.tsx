import { useEffect, useState, useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Info, Instagram, Mail, User } from "lucide-react";

import { navigationItems } from "@/components/layout/navigation";
import { getConfiguracionEmpresa } from "@/database/queries";
import type { ConfiguracionEmpresa } from "@/types";

export function AppSidebar() {
  const [config, setConfig] = useState<ConfiguracionEmpresa | null>(null);
  const [appVersion, setAppVersion] = useState("1.0.12");
  const pathname = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      return () => window.removeEventListener("hashchange", onStoreChange);
    },
    () => window.location.hash.replace(/^#/, "").split("?")[0] || "/dashboard",
    () => "/dashboard",
  );

  useEffect(() => {
    void getConfiguracionEmpresa().then(setConfig);
    void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  return (
    <aside className="app-sidebar hidden w-72 h-screen sticky top-0 border-r border-border/50 bg-card/40 backdrop-blur-xl lg:flex flex-col animate-in fade-in slide-in-from-left duration-700">
      {/* Brand Header */}
      <div className="app-sidebar-brand py-10 px-6 flex flex-col items-center justify-center text-center space-y-4 border-b border-border/30">
        {config?.logoPathLocal ? (
          <div className="app-sidebar-logo group relative size-[150px] overflow-hidden rounded-[2rem] border border-white/30 bg-white/10 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.55),inset_0_-1px_1px_rgba(0,0,0,0.16)] ring-1 ring-white/10 backdrop-blur-2xl transition-all hover:scale-105">
            <img
              src={convertFileSrc(config.logoPathLocal)}
              alt="Logo"
              className="h-full w-full rounded-[2rem] object-contain"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/35 via-white/5 to-black/10 opacity-70 mix-blend-screen" />
            <div aria-hidden="true" className="pointer-events-none absolute -left-5 -top-8 h-20 w-36 rotate-[-12deg] rounded-full bg-white/35 blur-2xl transition-transform duration-500 group-hover:translate-x-4" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-2 h-4 rounded-full bg-white/10 blur-md" />
          </div>
        ) : (
          <div className="app-sidebar-logo size-[150px] rounded-[2rem] bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
             <span className="text-3xl font-black text-primary">S</span>
          </div>
        )}
        
        <div className="space-y-0.5">
           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
             {config?.nombreEmpresa || "Soft Inventario"}
           </p>
           <h1 className="text-xl font-black tracking-tight text-foreground">Inventario Pro</h1>
        </div>
      </div>

      {/* Navigation */}
      <div className="app-sidebar-nav flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1.5 pt-6">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.to}
              href={`#${item.to}`}
              className={[
                  "group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all duration-300 relative overflow-hidden",
                  item.matches(pathname)
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")}
            >
              <div className="relative z-10 size-5 flex items-center justify-center shrink-0">
                 <Icon className="size-full transition-transform group-hover:scale-110" />
              </div>
              <div className="relative z-10 flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight leading-none">{item.label}</p>
                <p className={`text-[10px] truncate mt-1 opacity-60 font-medium`}>
                  {item.description}
                </p>
              </div>
              
              {/* Subtle hover effect light */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          );
        })}

        {/* Info & Contact Section */}
        <div className="app-sidebar-info mx-2 mt-8 p-4 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Info className="size-4" />
              <h3 className="text-xs font-black uppercase tracking-widest">Sobre Soft Inventario</h3>
            </div>
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-medium">
              Optimiza tu control de stock, evita faltantes y agiliza tus ventas de manera offline y segura. Diseñado para potenciar la gestión diaria del vendedor independiente.
            </p>
          </div>

          <div className="pt-3 border-t border-primary/20 space-y-2.5">
            <div className="flex items-center gap-3 group">
              <div className="size-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <User className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase text-primary/60 tracking-tighter">Programador / Diseñador</p>
                <p className="text-xs font-bold truncate">Mauricio Bronzi</p>
              </div>
            </div>

            <a 
              href="mailto:bronzidigital@gmail.com" 
              className="flex items-center gap-3 group hover:bg-background/50 p-1 -m-1 rounded-xl transition-all"
            >
              <div className="size-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Mail className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase text-primary/60 tracking-tighter">Email</p>
                <p className="text-xs font-bold truncate">bronzidigital@gmail.com</p>
              </div>
            </a>

            <a 
              href="https://www.instagram.com/bronzidigital/" 
              target="_blank" 
              className="flex items-center gap-3 group hover:bg-background/50 p-1 -m-1 rounded-xl transition-all"
            >
              <div className="size-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Instagram className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase text-primary/60 tracking-tighter">Instagram</p>
                <p className="text-xs font-bold truncate">@bronzidigital</p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="app-sidebar-footer p-6 border-t border-border/30">
         <div className="p-4 rounded-2xl bg-muted/20 border border-border/50 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Versión {appVersion} - Premium</p>
            <p className="text-[8px] text-muted-foreground mt-1 opacity-50">Base Offline-First | RSA SECURE</p>
         </div>
      </div>
    </aside>
  );
}
