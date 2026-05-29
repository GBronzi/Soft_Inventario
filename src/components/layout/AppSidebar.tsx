import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { NavLink } from "react-router-dom";
import { Info, Instagram, Mail, User } from "lucide-react";

import { navigationItems } from "@/components/layout/navigation";
import { getConfiguracionEmpresa } from "@/database/queries";
import type { ConfiguracionEmpresa } from "@/types";

export function AppSidebar() {
  const [config, setConfig] = useState<ConfiguracionEmpresa | null>(null);

  useEffect(() => {
    void getConfiguracionEmpresa().then(setConfig);
  }, []);

  return (
    <aside className="hidden w-72 h-screen sticky top-0 border-r border-border/50 bg-card/40 backdrop-blur-xl lg:flex flex-col animate-in fade-in slide-in-from-left duration-700">
      {/* Brand Header */}
      <div className="py-10 px-6 flex flex-col items-center justify-center text-center space-y-4 border-b border-border/30">
        {config?.logoPathLocal ? (
          <div className="p-4 rounded-[2.5rem] bg-background/80 shadow-2xl border border-border/50 group transition-all hover:scale-105">
            <img
              src={convertFileSrc(config.logoPathLocal)}
              alt="Logo"
              className="h-20 w-20 object-contain"
            />
          </div>
        ) : (
          <div className="size-20 rounded-[2.5rem] bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1.5 pt-6">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all duration-300 relative overflow-hidden",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")
              }
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
            </NavLink>
          );
        })}

        {/* Info & Contact Section */}
        <div className="mx-2 mt-8 p-4 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 space-y-4">
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
      <div className="p-6 border-t border-border/30">
         <div className="p-4 rounded-2xl bg-muted/20 border border-border/50 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Versión 1.0.4 - Premium</p>
            <p className="text-[8px] text-muted-foreground mt-1 opacity-50">Base Offline-First | RSA SECURE</p>
         </div>
      </div>
    </aside>
  );
}