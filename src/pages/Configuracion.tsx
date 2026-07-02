import { FormEvent, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Building2,
  Copy,
  Database,
  Download,
  Globe,
  Lock,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  PackageCheck,
  RefreshCcw,
  Save,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPreUpdateBackup, DATABASE_URL, pingDatabase } from "@/database/db";
import { checkForUpdate, type AvailableUpdate } from "@/lib/updater";
import { getConfiguracionEmpresa, saveConfiguracionEmpresa } from "@/database/queries";
import type { AuthStatus, ConfiguracionEmpresaDraft, LicenseStatus } from "@/types";

const initialForm: ConfiguracionEmpresaDraft = {
  nombreEmpresa: "",
  logoPathLocal: "",
  moneda: "ARS",
};

export function Configuracion() {
  const [dbReady, setDbReady] = useState(false);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [form, setForm] = useState<ConfiguracionEmpresaDraft>(initialForm);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityStatus, setSecurityStatus] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [securitySaving, setSecuritySaving] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.4");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  const loadData = async () => {
    try {
      const [databaseOk, licenseStatus, empresaConfig, accessStatus] = await Promise.all([
        pingDatabase(),
        invoke<LicenseStatus>("get_license_status"),
        getConfiguracionEmpresa(),
        invoke<AuthStatus>("get_auth_status"),
      ]);

      setDbReady(databaseOk);
      setLicense(licenseStatus);
      setAuthStatus(accessStatus);
      setNewUsername(accessStatus.username ?? "");
      setForm({
        nombreEmpresa: empresaConfig.nombreEmpresa ?? "",
        logoPathLocal: empresaConfig.logoPathLocal ?? "",
        moneda: empresaConfig.moneda,
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void loadData();
    void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  async function handleCheckForUpdates() {
    setCheckingUpdate(true);
    setUpdateStatus("Buscando actualizaciones...");
    try {
      const nextUpdate = await checkForUpdate();
      setAvailableUpdate(nextUpdate);
      setUpdateStatus(nextUpdate ? `Versión ${nextUpdate.version} disponible.` : "El programa está actualizado.");
    } catch (error) {
      setUpdateStatus(`Error al buscar actualizaciones: ${String(error)}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallUpdate() {
    if (!availableUpdate) return;
    setCheckingUpdate(true);
    setUpdateStatus("Creando respaldo y descargando...");
    try {
      await availableUpdate.install(setUpdateProgress);
    } catch (error) {
      setUpdateStatus(`Error al instalar: ${String(error)}`);
      setCheckingUpdate(false);
    }
  }

  async function handleManualBackup() {
    setUpdateStatus("Creando respaldo...");
    try {
      const path = await createPreUpdateBackup(appVersion);
      setUpdateStatus(`Respaldo creado en: ${path}`);
    } catch (error) {
      setUpdateStatus(`Error al crear respaldo: ${String(error)}`);
    }
  }

  async function handleSelectLogo() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (typeof selected === "string") {
        setForm((prev) => ({ ...prev, logoPathLocal: selected }));
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await saveConfiguracionEmpresa(form);
      setStatus("Configuración guardada.");
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCredentialChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityStatus(null);
    if (newPassword !== confirmPassword) {
      setSecurityStatus("Error: las contraseñas nuevas no coinciden.");
      return;
    }
    setSecuritySaving(true);
    try {
      const nextStatus = await invoke<AuthStatus>("change_credentials", { currentPassword, username: newUsername, password: newPassword });
      setAuthStatus(nextStatus);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityStatus("Credenciales actualizadas correctamente.");
    } catch (error) {
      setSecurityStatus(`Error: ${String(error)}`);
    } finally {
      setSecuritySaving(false);
    }
  }

  async function handleGenerateRecoveryCode() {
    setSecurityStatus(null);
    setRecoveryCode(null);
    setSecuritySaving(true);
    try {
      const code = await invoke<string>("generate_recovery_code", { currentPassword: recoveryPassword });
      setRecoveryCode(code);
      setAuthStatus((value) => value ? { ...value, recoveryConfigured: true } : value);
      setRecoveryPassword("");
      setSecurityStatus("Código generado. Guárdalo ahora: sólo se mostrará esta vez.");
    } catch (error) {
      setSecurityStatus(`Error: ${String(error)}`);
    } finally {
      setSecuritySaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground">Gestiona la identidad de tu empresa y el estado de la infraestructura local.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => void loadData()}>
          <RefreshCcw className="size-4" /> Refrescar Estado
        </Button>
      </div>

      <Card className="border-none bg-card/60 shadow-xl backdrop-blur-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><UserRoundCog className="size-5" /></div>
            <div>
              <CardTitle>Seguridad de acceso</CardTitle>
              <CardDescription>Cambia las credenciales y prepara una recuperación segura para esta instalación.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCredentialChange} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold">
                <span>Usuario</span>
                <Input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} required />
              </label>
              <label className="space-y-2 text-sm font-semibold">
                <span>Contraseña actual</span>
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={8} required />
              </label>
              <label className="space-y-2 text-sm font-semibold">
                <span>Nueva contraseña</span>
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
              </label>
              <label className="space-y-2 text-sm font-semibold">
                <span>Confirmar contraseña</span>
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
              </label>
            </div>
            <Button type="submit" disabled={securitySaving} className="gap-2"><KeyRound className="size-4" /> Actualizar credenciales</Button>
          </form>

          <div className="space-y-4 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <p className="font-semibold">Código de recuperación</p>
              <p className="mt-1 text-sm text-muted-foreground">Es único para esta instalación y queda invalidado después de restablecer el acceso.</p>
            </div>
            <Badge variant="outline">{authStatus?.recoveryConfigured ? "Recuperación configurada" : "Pendiente de configurar"}</Badge>
            <label className="block space-y-2 text-sm font-semibold">
              <span>Contraseña actual</span>
              <Input type="password" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} minLength={8} placeholder="Confirma tu identidad" />
            </label>
            <Button type="button" variant="outline" disabled={securitySaving || recoveryPassword.length < 8} onClick={() => void handleGenerateRecoveryCode()} className="gap-2">
              <KeyRound className="size-4" /> {authStatus?.recoveryConfigured ? "Generar un código nuevo" : "Generar código"}
            </Button>
            {recoveryCode && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <code className="break-all text-base font-bold tracking-wider">{recoveryCode}</code>
                  <Button type="button" variant="ghost" size="icon" title="Copiar código" aria-label="Copiar código" onClick={() => void navigator.clipboard.writeText(recoveryCode)}><Copy className="size-4" /></Button>
                </div>
              </div>
            )}
          </div>
          {securityStatus && <p role="status" className={`text-sm font-semibold lg:col-span-2 ${securityStatus.startsWith("Error") ? "text-rose-500" : "text-emerald-600"}`}>{securityStatus}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Identidad de la Empresa */}
        <div className="lg:col-span-12 xl:col-span-8">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-primary/5 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <CardTitle>Identidad Comercial</CardTitle>
                  <CardDescription>Personaliza cómo se ve tu sistema</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Nombre Fantasía / Empresa</label>
                    <Input 
                      className="rounded-xl h-12 bg-background/50 border-border/50 text-lg font-bold" 
                      placeholder="Ej: Perfumería Luxury" 
                      value={form.nombreEmpresa} 
                      onChange={e => setForm({...form, nombreEmpresa: e.target.value})} 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-1">
                       <Globe className="size-3" /> Moneda del Sistema
                    </label>
                    <select 
                      className="h-12 w-full rounded-xl border border-border/50 bg-background/50 px-4 py-2 text-sm font-black focus:ring-2 focus:ring-primary/20 appearance-none outline-none"
                      value={form.moneda}
                      onChange={e => setForm({...form, moneda: e.target.value.toUpperCase()})}
                    >
                      <option value="ARS">Peso Argentino (ARS)</option>
                      <option value="USD">Dólar Estadounidense (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Logo Institucional</label>
                  <div className="group relative aspect-video w-full rounded-3xl bg-muted/20 border-2 border-dashed border-border/50 flex items-center justify-center overflow-hidden transition-all hover:bg-muted/40 cursor-pointer" onClick={handleSelectLogo}>
                    {form.logoPathLocal ? (
                      <img src={convertFileSrc(form.logoPathLocal)} alt="Logo" className="h-full w-full object-contain p-4" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground/30">
                        <ImageIcon className="size-10" />
                        <span className="text-[10px] font-black uppercase">Cargar Logo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Button type="button" variant="secondary" size="sm" className="rounded-xl font-bold">Cambiar Imagen</Button>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground italic text-center">Recomendado: Fondo transparente PNG o WEBP</p>
                </div>

                <div className="md:col-span-2 pt-4 flex items-center justify-between border-t border-border/50">
                   <p className={`text-xs font-bold ${status?.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>{status}</p>
                   <Button disabled={saving} type="submit" className="h-12 px-10 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl hover:shadow-primary/20 transition-all gap-2">
                    <Save className="size-4" /> {saving ? "Guardando..." : "Guardar Cambios"}
                   </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Estado e Infraestructura */}
        <div className="lg:col-span-12 xl:col-span-4 space-y-6">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest opacity-60"><PackageCheck className="size-4" /> Actualizaciones</CardTitle>
              <CardDescription>Versión instalada: {appVersion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {updateStatus && <p role="status" className={`text-xs ${updateStatus.startsWith("Error") ? "text-rose-500" : "text-muted-foreground"}`}>{updateStatus}</p>}
              {checkingUpdate && updateProgress > 0 && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${updateProgress}%` }} /></div>}
              {availableUpdate ? (
                <Button className="w-full gap-2" disabled={checkingUpdate} onClick={() => void handleInstallUpdate()}><Download className="size-4" /> {checkingUpdate ? `Descargando ${updateProgress}%` : `Instalar versión ${availableUpdate.version}`}</Button>
              ) : (
                <Button variant="outline" className="w-full gap-2" disabled={checkingUpdate} onClick={() => void handleCheckForUpdates()}><RefreshCcw className={`size-4 ${checkingUpdate ? "animate-spin" : ""}`} /> Buscar actualizaciones</Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-3">
               <CardTitle className="text-sm font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                  <Database className="size-4" /> Base de Datos
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-2xl bg-background/40 border border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-medium opacity-60">Motor:</span>
                   <Badge variant="outline" className="font-mono text-[9px]">SQLite 3 (Local)</Badge>
                </div>
                <div className="flex items-center justify-between">
                   <span className="text-xs font-medium opacity-60">Estado:</span>
                   <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${dbReady ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span className="text-xs font-bold">{dbReady ? 'Conectado' : 'Error'}</span>
                   </div>
                </div>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Ruta del archivo</p>
                 <Input readOnly className="h-8 text-[10px] bg-muted/30 font-mono" value={DATABASE_URL} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-3">
               <CardTitle className="text-sm font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Licenciamiento
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className={`p-5 rounded-3xl border-2 border-dashed ${license?.isValid ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                  <div className="flex items-center gap-4">
                     <div className={`p-3 rounded-2xl ${license?.isValid ? 'bg-emerald-500/20 text-emerald-600' : 'bg-rose-500/20 text-rose-600'}`}>
                        {license?.isValid ? <ShieldCheck className="size-6" /> : <Lock className="size-6" />}
                     </div>
                     <div>
                        <p className="text-xs font-black uppercase tracking-tighter">{license?.mode || "Verificando..."}</p>
                        <p className={`text-[10px] font-bold ${license?.isValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                           {license?.isValid ? 'Licencia Validada' : 'Sin Licencia Activa'}
                        </p>
                     </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 leading-relaxed italic">
                    "{license?.message || "Cargando mensaje de licencia del servidor de Rust..."}"
                  </p>
               </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-primary text-primary-foreground overflow-hidden group">
            <CardContent className="p-6 relative">
               <HardDrive className="absolute -right-4 -bottom-4 size-32 opacity-10 group-hover:scale-110 transition-transform" />
               <div className="relative space-y-4">
                  <div className="space-y-1">
                    <h3 className="font-black text-xl">Backup Local</h3>
                    <p className="text-xs opacity-70">Haz una copia manual de tu base de datos SQLite ahora mismo.</p>
                  </div>
                  <Button variant="secondary" onClick={() => void handleManualBackup()} className="w-full rounded-xl font-bold h-11 bg-white text-primary hover:bg-white/90 shadow-2xl">
                    Crear Backup (.db)
                  </Button>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
