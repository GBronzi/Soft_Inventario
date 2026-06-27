import { useState, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  ShieldAlert, 
  CheckCircle2, 
  ShieldHalf
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import type { LicenseStatus } from "@/types";
interface Props {
  initialStatus: LicenseStatus;
  onActivated: () => void;
}

export function Activacion({ initialStatus, onActivated }: Props) {
  const [key, setKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(initialStatus.message);

  async function handleActivate(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    
    setVerifying(true);
    setErrorStatus(null);
    try {
      const response = await invoke<LicenseStatus>("activate_license", { licenseKey: key.trim() });
      if (response.isValid) {
        onActivated();
      } else {
        setErrorStatus(response.message);
      }
    } catch (err) {
      setErrorStatus(typeof err === 'string' ? err : "Error al procesar la licencia.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-[oklch(var(--b1))] relative overflow-hidden">
      {/* Elementos decorativos de fondo para dar sensación de seguridad */}
      <div className="absolute top-[-10%] right-[-5%] size-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] size-96 bg-primary/5 rounded-full blur-3xl" />
      
      <Card className="w-full max-w-xl border-none shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] bg-card/70 backdrop-blur-xl rounded-[2.5rem] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
        <CardHeader className="text-center pt-12 pb-8">
           <div className="mx-auto size-20 rounded-[2rem] bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 shadow-inner">
              <ShieldCheck className="size-10 text-primary" />
           </div>
           <CardTitle className="text-3xl font-black tracking-tight mb-2">Activación de Licencia</CardTitle>
           <CardDescription className="px-8 text-sm font-medium leading-relaxed">
             Para acceder a las funciones premium de <span className="text-foreground font-black">Soft Inventario</span>, ingresa la clave RSA proporcionada por el proveedor.
           </CardDescription>
        </CardHeader>

        <CardContent className="px-10 pb-10 space-y-6">
          {errorStatus && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 animate-in shake-1 duration-300">
              <ShieldAlert className="size-5 shrink-0" />
              <div className="space-y-1">
                 <p className="text-[10px] font-black uppercase tracking-widest">Error de Validación</p>
                 <p className="text-xs font-bold leading-tight">{errorStatus}</p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleActivate} className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                   <Key className="size-3" /> Token de Activación RSA
                </label>
                <Badge variant="outline" className="text-[8px] font-black uppercase border-none bg-muted/30">Criptografía 2048-bit</Badge>
              </div>
              <Textarea 
                placeholder="Pega aquí el código Base64 generado..."
                className="min-h-[140px] rounded-[1.5rem] bg-muted/20 border-border/50 font-mono text-[10px] p-5 leading-relaxed focus:ring-primary/20 transition-all shadow-inner"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={verifying}
              />
            </div>

            <Button 
                type="submit" 
                className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all gap-3 text-base border-none" 
                disabled={!key.trim() || verifying}
            >
              {verifying ? (
                <>
                  <ShieldHalf className="size-5 animate-spin" />
                  Validando Criptografía...
                </>
              ) : (
                <>
                  <Lock className="size-5" />
                  Activar Sistema
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-4 p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/10">
              <Button variant="ghost" className="rounded-2xl h-12 text-emerald-700 hover:bg-emerald-500/10 font-bold border border-emerald-500/20">
                <Link to="/catalogo">Explorar Catálogo</Link>
              </Button>
              <div className="space-y-0.5">
                 <p className="text-[10px] font-black uppercase text-emerald-600 tracking-tighter">Seguridad Local Garantizada</p>
                 <p className="text-[10px] text-muted-foreground font-medium leading-tight">
                    La validación ocurre íntegramente en tu dispositivo usando el núcleo de Rust. Sin envío de datos privados a la nube.
                 </p>
              </div>
          </div>
        </CardContent>

        <CardFooter className="justify-center py-6 px-10 bg-muted/20 border-t border-border/30">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="size-3" /> Certificado de Autenticidad Soft Inventario
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
