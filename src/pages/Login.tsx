import { Copy, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

import { ParticleField } from "@/components/auth/ParticleField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthStatus } from "@/types";

interface LoginProps {
  status: AuthStatus;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onSetup: (username: string, password: string) => Promise<string>;
  onSetupComplete?: () => void;
  onRecover?: (recoveryCode: string, username: string, password: string) => Promise<void>;
  onCreateSupportRequest?: () => Promise<string>;
  onSupportReset?: (supportResponse: string, username: string, password: string) => Promise<void>;
}

export function Login({ status, onLogin, onSetup, onSetupComplete, onRecover, onCreateSupportRequest, onSupportReset }: LoginProps) {
  const setupMode = !status.configured;
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [initialRecoveryCode, setInitialRecoveryCode] = useState("");
  const [recoveryCodeCopied, setRecoveryCodeCopied] = useState(false);
  const [supportMode, setSupportMode] = useState(false);
  const [supportRequest, setSupportRequest] = useState("");
  const [supportResponse, setSupportResponse] = useState("");
  const [username, setUsername] = useState(status.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if ((setupMode || recoveryMode || supportMode) && password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      if (supportMode && onSupportReset) {
        await onSupportReset(supportResponse, username, password);
      } else if (recoveryMode && onRecover) {
        await onRecover(recoveryCode, username, password);
      } else if (setupMode) {
        const generatedCode = await onSetup(username, password);
        setInitialRecoveryCode(generatedCode);
      } else if (!(await onLogin(username, password))) {
        setError("Usuario o contraseña incorrectos.");
        setPassword("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  if (initialRecoveryCode) {
    return (
      <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#080a0c] px-5 py-10 text-white">
        <ParticleField />
        <div className="pointer-events-none absolute inset-0 z-0 bg-black/10" aria-hidden="true" />
        <section className="relative z-10 w-full max-w-md rounded-lg border border-white/15 bg-[#15191d]/95 p-7 shadow-2xl backdrop-blur-md">
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/10">
              <ShieldCheck className="size-7 text-emerald-200" />
            </div>
            <p className="text-xs font-bold uppercase text-emerald-200">Cuenta creada</p>
            <h1 className="mt-2 text-2xl font-black">Guarda tu código de recuperación</h1>
            <p className="mt-3 text-sm leading-6 text-white/65">Lo necesitarás si olvidas el usuario o la contraseña. Este código se mostrará solamente ahora.</p>
          </div>

          <div className="mt-6 rounded-md border border-amber-300/30 bg-amber-300/10 p-4">
            <code className="block break-all text-center text-lg font-bold tracking-wider text-amber-100">{initialRecoveryCode}</code>
          </div>

          <div className="mt-5 space-y-3">
            <Button type="button" variant="outline" className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => { void navigator.clipboard.writeText(initialRecoveryCode); setRecoveryCodeCopied(true); }}>
              <Copy className="mr-2 size-4" /> {recoveryCodeCopied ? "Código copiado" : "Copiar código"}
            </Button>
            <Button type="button" className="h-11 w-full bg-cyan-200 text-slate-950 hover:bg-cyan-100" onClick={onSetupComplete}>
              <LogIn className="mr-2 size-4" /> Ya guardé el código e ingresar
            </Button>
          </div>
        </section>
      </main>
    );
  }

  async function openSupportRecovery() {
    if (!onCreateSupportRequest) return;
    setLoading(true);
    setError("");
    try {
      const request = await onCreateSupportRequest();
      setSupportRequest(request);
      setRecoveryMode(false);
      setSupportMode(true);
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#080a0c] px-5 py-10 text-white">
      <ParticleField />
      <div className="pointer-events-none absolute inset-0 z-0 bg-black/10" aria-hidden="true" />

      <section className="relative z-10 w-full max-w-sm rounded-lg border border-white/15 bg-[#15191d]/95 p-7 shadow-2xl backdrop-blur-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
            <LockKeyhole className="size-7 text-cyan-200" />
          </div>
          <p className="text-xs font-bold uppercase text-cyan-200">Soft Inventario</p>
          <h1 className="mt-2 text-2xl font-black">Inventario Pro</h1>
          <p className="mt-2 text-sm text-white/60">{supportMode ? "Recuperación asistida" : recoveryMode ? "Restablecer acceso" : setupMode ? "Crear acceso de administrador" : "Acceso al sistema"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {recoveryMode && (
            <label className="block space-y-1.5 text-sm font-semibold text-white/80">
              <span>Código de recuperación</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <Input autoFocus value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} className="h-11 border-white/15 bg-white/5 pl-9 font-mono uppercase text-white" required />
              </div>
            </label>
          )}

          {supportMode && (
            <div className="space-y-3">
              <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                <span>Solicitud para soporte</span>
                <textarea readOnly value={supportRequest} className="min-h-20 w-full resize-none rounded-md border border-white/15 bg-white/5 p-3 font-mono text-xs text-white" />
              </label>
              <Button type="button" variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => void navigator.clipboard.writeText(supportRequest)}>Copiar solicitud</Button>
              <label className="block space-y-1.5 text-sm font-semibold text-white/80">
                <span>Respuesta de soporte</span>
                <textarea value={supportResponse} onChange={(event) => setSupportResponse(event.target.value.trim())} className="min-h-20 w-full resize-none rounded-md border border-white/15 bg-white/5 p-3 font-mono text-xs text-white" required />
              </label>
            </div>
          )}

          <label className="block space-y-1.5 text-sm font-semibold text-white/80">
            <span>Usuario</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <Input autoFocus={!recoveryMode && !supportMode} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 border-white/15 bg-white/5 pl-9 text-white placeholder:text-white/30" required minLength={3} />
            </div>
          </label>

          <label className="block space-y-1.5 text-sm font-semibold text-white/80">
            <span>Contraseña</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <Input type={showPassword ? "text" : "password"} autoComplete={setupMode || recoveryMode || supportMode ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 border-white/15 bg-white/5 px-9 text-white" required minLength={8} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-0 top-1/2 -translate-y-1/2 text-white/55 hover:bg-white/10 hover:text-white">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </label>

          {(setupMode || recoveryMode || supportMode) && (
            <label className="block space-y-1.5 text-sm font-semibold text-white/80">
              <span>Confirmar contraseña</span>
              <Input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11 border-white/15 bg-white/5 text-white" required minLength={8} />
            </label>
          )}

          {error && <p role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>}

          <Button type="submit" className="h-11 w-full bg-cyan-200 text-slate-950 hover:bg-cyan-100" disabled={loading || username.trim().length < 3 || password.length < 8 || (recoveryMode && !recoveryCode.trim()) || (supportMode && !supportResponse.trim())}>
            {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <LogIn className="mr-2 size-4" />}
            {supportMode ? "Validar y restablecer" : recoveryMode ? "Restablecer e ingresar" : setupMode ? "Crear acceso" : "Ingresar"}
          </Button>

          {!setupMode && !supportMode && status.recoveryConfigured && onRecover && (
            <Button type="button" variant="ghost" className="w-full text-white/60 hover:bg-white/5 hover:text-white" onClick={() => { setRecoveryMode((value) => !value); setError(""); setPassword(""); setConfirmation(""); }}>
              {recoveryMode ? "Volver al inicio de sesión" : "Olvidé mi contraseña"}
            </Button>
          )}
          {!setupMode && !recoveryMode && onCreateSupportRequest && onSupportReset && (
            <Button type="button" variant="ghost" className="w-full text-white/60 hover:bg-white/5 hover:text-white" disabled={loading} onClick={() => supportMode ? setSupportMode(false) : void openSupportRecovery()}>
              {supportMode ? "Volver al inicio de sesión" : "Recuperación con soporte"}
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}
