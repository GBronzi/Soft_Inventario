import { useEffect, useState } from "react";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Activacion } from "@/pages/Activacion";
import { Login } from "@/pages/Login";
import type { AuthStatus, LicenseStatus } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Catalogo } from "@/pages/Catalogo";
import { Configuracion } from "@/pages/Configuracion";
import { Dashboard } from "@/pages/Dashboard";
import { Gastos } from "@/pages/Gastos";
import { Contactos } from "@/pages/Contactos";
import { Movimientos } from "@/pages/Movimientos";
import { Onboarding } from "@/pages/Onboarding";
import { ProductoDetalle } from "@/pages/ProductoDetalle";
import { ProductoForm } from "@/pages/ProductoForm";
import { Tiendanube } from "@/pages/Tiendanube";
import { Ventas } from "@/pages/Ventas";

const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate replace to="/dashboard" /> },
      { path: "/onboarding", element: <Onboarding /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/catalogo", element: <Catalogo /> },
      { path: "/producto/nuevo", element: <ProductoForm /> },
      { path: "/producto/:inventarioId/editar", element: <ProductoForm /> },
      { path: "/producto/:inventarioId", element: <ProductoDetalle /> },
      { path: "/movimientos", element: <Movimientos /> },
      { path: "/ventas", element: <Ventas /> },
      { path: "/gastos", element: <Gastos /> },
      { path: "/contactos", element: <Contactos /> },
      { path: "/escaner", element: <Navigate replace to="/contactos" /> },
      { path: "/tiendanube", element: <Tiendanube /> },
      { path: "/configuracion", element: <Configuracion /> },
    ],
  },
]);

import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function App() {
  const [license, setLicense] = useState<LicenseStatus | null>(import.meta.env.DEV ? { isValid: true, holder: null, expiresAt: null, mode: "development", message: "" } : null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && !isTauriRuntime) return;
    void invoke<LicenseStatus>('get_license_status').then(setLicense);
  }, []);

  useEffect(() => {
    if (!license?.isValid) return;
    if (import.meta.env.DEV && !isTauriRuntime) {
      setAuthStatus({ configured: false, username: null });
      return;
    }
    void invoke<AuthStatus>("get_auth_status").then(setAuthStatus);
  }, [license?.isValid]);

  async function handleSetup(username: string, password: string) {
    if (import.meta.env.DEV && !isTauriRuntime) {
      setAuthStatus({ configured: true, username: username.trim(), recoveryConfigured: true });
      return "ABCDE-23456-FGHIJ-7890K";
    }
    const nextStatus = await invoke<AuthStatus>("setup_auth", { username, password });
    const recoveryCode = await invoke<string>("generate_recovery_code", { currentPassword: password });
    setAuthStatus({ ...nextStatus, recoveryConfigured: true });
    return recoveryCode;
  }

  async function handleLogin(username: string, password: string) {
    if (import.meta.env.DEV && !isTauriRuntime) {
      setAuthenticated(true);
      return true;
    }
    const valid = await invoke<boolean>("login", { username, password });
    if (valid) setAuthenticated(true);
    return valid;
  }

  async function handleRecovery(recoveryCode: string, username: string, password: string) {
    if (import.meta.env.DEV && !isTauriRuntime) {
      setAuthStatus({ configured: true, username: username.trim(), recoveryConfigured: false });
      setAuthenticated(true);
      return;
    }
    const nextStatus = await invoke<AuthStatus>("reset_with_recovery", { recoveryCode, username, password });
    setAuthStatus(nextStatus);
    setAuthenticated(true);
  }

  async function handleCreateSupportRequest() {
    if (import.meta.env.DEV && !isTauriRuntime) return "SOLICITUD-DE-SOPORTE-DEMO";
    return invoke<string>("generate_support_request");
  }

  async function handleSupportReset(supportResponse: string, username: string, password: string) {
    if (import.meta.env.DEV && !isTauriRuntime) {
      setAuthStatus({ configured: true, username: username.trim(), recoveryConfigured: false });
      setAuthenticated(true);
      return;
    }
    const nextStatus = await invoke<AuthStatus>("reset_with_support", { supportResponse, username, password });
    setAuthStatus(nextStatus);
    setAuthenticated(true);
  }

  if (!license) {
    return (
      <div className="p-10 text-center text-muted-foreground flex items-center justify-center min-h-screen">
        Cargando motor offline...
      </div>
    );
  }

  if (!license.isValid) {
    return <Activacion initialStatus={license} onActivated={() => invoke<LicenseStatus>("get_license_status").then(setLicense)} />;
  }

  if (!authStatus) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Cargando acceso seguro...</div>;
  }

  if (!authenticated) {
    return (
      <ThemeProvider>
        <Login status={authStatus} onLogin={handleLogin} onSetup={handleSetup} onSetupComplete={() => setAuthenticated(true)} onRecover={handleRecovery} onCreateSupportRequest={handleCreateSupportRequest} onSupportReset={handleSupportReset} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider logout={() => setAuthenticated(false)}>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
