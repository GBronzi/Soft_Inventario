import {
  Boxes,
  ClipboardList,
  Gauge,
  PackagePlus,
  Receipt,
  ContactRound,
  Settings,
  Store,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  matches: (pathname: string) => boolean;
}

export const navigationItems: NavigationItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Vista general del inventario.",
    icon: Gauge,
    matches: (pathname) => pathname.startsWith("/dashboard"),
  },
  {
    to: "/catalogo",
    label: "Catálogo",
    description: "Productos y stock actual.",
    icon: Boxes,
    matches: (pathname) => pathname.startsWith("/catalogo"),
  },
  {
    to: "/producto/nuevo",
    label: "Nuevo producto",
    description: "Alta inicial de artículos.",
    icon: PackagePlus,
    matches: (pathname) => pathname.startsWith("/producto"),
  },
  {
    to: "/movimientos",
    label: "Movimientos",
    description: "Historial y kardex base.",
    icon: ClipboardList,
    matches: (pathname) => pathname.startsWith("/movimientos"),
  },
  {
    to: "/gastos",
    label: "Gastos",
    description: "Control mensual de egresos.",
    icon: Receipt,
    matches: (pathname) => pathname.startsWith("/gastos"),
  },
  {
    to: "/contactos",
    label: "Contactos",
    description: "Agenda e intercambio CSV.",
    icon: ContactRound,
    matches: (pathname) => pathname.startsWith("/contactos"),
  },
  {
    to: "/tiendanube",
    label: "Tiendanube",
    description: "Integración externa futura.",
    icon: Store,
    matches: (pathname) => pathname.startsWith("/tiendanube"),
  },
  {
    to: "/configuracion",
    label: "Configuración",
    description: "Base local y licencias.",
    icon: Settings,
    matches: (pathname) => pathname.startsWith("/configuracion"),
  },
];

export function getActiveNavigationItem(pathname: string) {
  return navigationItems.find((item) => item.matches(pathname));
}
