import { useEffect, useState } from "react";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Activacion } from "@/pages/Activacion";
import type { LicenseStatus } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Catalogo } from "@/pages/Catalogo";
import { Configuracion } from "@/pages/Configuracion";
import { Dashboard } from "@/pages/Dashboard";
import { Movimientos } from "@/pages/Movimientos";
import { Onboarding } from "@/pages/Onboarding";
import { ProductoDetalle } from "@/pages/ProductoDetalle";
import { ProductoForm } from "@/pages/ProductoForm";
import { Tiendanube } from "@/pages/Tiendanube";

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
      { path: "/tiendanube", element: <Tiendanube /> },
      { path: "/configuracion", element: <Configuracion /> },
    ],
  },
]);

import { ThemeProvider } from "@/components/shared/ThemeProvider";

function App() {
  const [license, setLicense] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    void invoke<LicenseStatus>("get_license_status").then(setLicense);
  }, []);

  if (!license) return <div className="p-10 text-center text-muted-foreground flex items-center justify-center min-h-screen">Cargando motor offline...</div>;

  if (!license.isValid) {
    return <Activacion initialStatus={license} onActivated={() => invoke<LicenseStatus>("get_license_status").then(setLicense)} />;
  }

  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
