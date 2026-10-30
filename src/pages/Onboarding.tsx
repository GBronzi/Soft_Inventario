import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  Sparkles, 
  Rocket, 
  PackageSearch, 
  ArrowRightLeft, 
  ShieldCheck, 
  ShoppingBag,
  ArrowRight,
  PlusCircle,
  LayoutDashboard,
  Settings
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getConfiguracionEmpresa } from "@/database/queries";

const pasos = [
  {
    title: "Catálogo Inteligente",
    description: "Crea productos con variantes y controla el stock mínimo con alertas visuales.",
    icon: PackageSearch,
    color: "text-blue-500",
    bg: "bg-blue-500/10"
  },
  {
    title: "Movimientos Rápidos",
    description: "Registra entradas y salidas con un solo clic usando plantillas operativas.",
    icon: ArrowRightLeft,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10"
  },
  {
    title: "Seguridad Offline",
    description: "Tu base de datos es local y privada. La licencia se valida vía RSA.",
    icon: ShieldCheck,
    color: "text-amber-500",
    bg: "bg-amber-500/10"
  },
  {
    title: "Omnicanalidad",
    description: "Sincroniza el stock de tu tienda física con Tiendanube automáticamente.",
    icon: ShoppingBag,
    color: "text-pink-500",
    bg: "bg-pink-500/10"
  }
];

export function Onboarding() {
  const [empresa, setEmpresa] = useState<{ nombreEmpresa: string | null; moneda: string; logoPathLocal: string | null }>({
    nombreEmpresa: null,
    moneda: "ARS",
    logoPathLocal: null,
  });

  useEffect(() => {
    void getConfiguracionEmpresa().then(setEmpresa);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Section */}
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest border border-primary/20 mb-2">
           <Sparkles className="size-3" /> Sistema de Inventario Premium
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-none">
          {empresa.nombreEmpresa ? (
            <>Bienvenido a <span className="text-primary italic">{empresa.nombreEmpresa}</span></>
          ) : (
            <>Impulsa tu <span className="text-primary italic">Negocio</span></>
          )}
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-medium">
          Has iniciado la plataforma de gestión de inventario offline-first más avanzada. 
          Todo está listo para que tomes el control total de tu stock.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Guía de Inicio */}
        <div className="lg:col-span-8 space-y-6">
           <div className="grid gap-4 sm:grid-cols-2">
              {pasos.map((paso) => (
                <Card key={paso.title} className="border-none shadow-xl bg-card/60 backdrop-blur-md hover:bg-card transition-all group cursor-default">
                  <CardContent className="p-6 space-y-4">
                    <div className={`size-12 rounded-2xl ${paso.bg} ${paso.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <paso.icon className="size-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-black text-lg">{paso.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">{paso.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
           </div>

           <Card className="border-none shadow-2xl bg-primary text-primary-foreground overflow-hidden rounded-[2.5rem]">
              <CardContent className="p-10 flex flex-col md:flex-row items-center gap-8 relative">
                 <Rocket className="absolute -right-8 -bottom-8 size-48 opacity-10 rotate-12" />
                 <div className="space-y-4 relative z-10 flex-1">
                    <h2 className="text-3xl font-black tracking-tight">¿Listo para empezar?</h2>
                    <p className="opacity-80 font-medium">Comienza cargando tu primer producto para habilitar todas las funciones del tablero.</p>
                    <div className="flex gap-3">
                       <Button className="rounded-2xl h-12 px-8 bg-white text-primary font-black hover:bg-white/90 shadow-xl">
                          <Link to="/producto/nuevo" className="flex items-center gap-2">
                            Crear Producto <PlusCircle className="size-4" />
                          </Link>
                       </Button>
                       <Button variant="ghost" className="rounded-2xl h-12 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground font-bold border border-current/20">
                          <Link to="/catalogo">Explorar Catálogo</Link>
                       </Button>
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* Status y Accesos */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="border-none shadow-xl bg-card/40 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-4">
                 <CardTitle className="text-xs font-black uppercase tracking-widest opacity-40">Estado de Configuración</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-3 p-4 rounded-3xl bg-background/50 border border-border/50">
                    <div className="flex justify-between items-center text-xs">
                       <span className="opacity-50 font-bold">EMPRESA:</span>
                       <span className="font-black">{empresa.nombreEmpresa || "SIN NOMBRE"}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="opacity-50 font-bold">MONEDA:</span>
                       <span className="font-black text-primary">{empresa.moneda}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="opacity-50 font-bold">LOGO:</span>
                       <span className="font-black truncate max-w-[100px]">{empresa.logoPathLocal ? "CARGADO" : "PENDIENTE"}</span>
                    </div>
                 </div>
                 <Button variant="outline" className="w-full rounded-2xl h-11 font-bold gap-2 text-xs border-border/50">
                    <Link to="/configuracion"><Settings className="size-3" /> Ajustes de Empresa</Link>
                 </Button>
              </CardContent>
           </Card>

           <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ml-4">Atajos Operativos</h4>
              <Link to="/dashboard" className="flex items-center justify-between p-5 rounded-3xl bg-card/60 border border-border/50 hover:border-primary/50 transition-all group">
                 <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                       <LayoutDashboard className="size-5" />
                    </div>
                    <div>
                       <p className="text-sm font-black">Panel de Control</p>
                       <p className="text-[10px] text-muted-foreground font-bold">Vista global de stock</p>
                    </div>
                 </div>
                 <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </Link>
              <Link to="/movimientos" className="flex items-center justify-between p-5 rounded-3xl bg-card/60 border border-border/50 hover:border-emerald-500/50 transition-all group">
                 <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                       <ArrowRightLeft className="size-5" />
                    </div>
                    <div>
                       <p className="text-sm font-black">Kardex Diario</p>
                       <p className="text-[10px] text-muted-foreground font-bold">Entradas y salidas</p>
                    </div>
                 </div>
                 <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </Link>
           </div>
        </div>
      </div>
    </div>
  );
}
