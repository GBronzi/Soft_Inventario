export interface ReleaseNoteSection {
  title: string;
  items: string[];
}

const RELEASE_NOTES: Record<string, ReleaseNoteSection[]> = {
  "1.0.12": [
    {
      title: "Actualizaciones",
      items: [
        "Nueva ventana flotante que informa la version disponible antes de instalar.",
        "Detalle de mejoras, parches y cambios importantes dentro del programa.",
        "Boton para instalar la actualizacion y opcion para recordar mas tarde.",
        "Barra de progreso durante la descarga e instalacion.",
      ],
    },
    {
      title: "Kardex y Tiendanube",
      items: [
        "Cuando Tiendanube cambia el stock local, ahora queda registrado como Ajuste por Tiendanube.",
        "El historial muestra la diferencia de stock con signo positivo o negativo y referencia de origen.",
        "Los movimientos se ordenan por fecha e id para evitar lecturas confusas en operaciones cercanas.",
        "La columna de stock ahora se muestra como Stock despues para explicar mejor el resultado del movimiento.",
      ],
    },
    {
      title: "Validacion",
      items: [
        "Se agregaron pruebas para las notas de actualizacion y para el ajuste de stock importado desde Tiendanube.",
      ],
    },
  ],
  "1.0.11": [
    {
      title: "Ventas y caja",
      items: [
        "Nueva ventana de venta para agregar varios productos por nombre, SKU o lector de codigo de barras.",
        "Registro de medio de pago: efectivo, transferencia, tarjeta u otro.",
        "Descuento de stock en una sola operacion con detalle por producto y cantidad.",
        "Resumen de ventas del dia en Vista general con tabla, unidades, medios de pago y total.",
      ],
    },
    {
      title: "Stock y sincronizacion",
      items: [
        "Cada venta registra movimientos de salida por venta para mantener el resumen mensual.",
        "Luego de confirmar la venta se intenta enviar el stock actualizado a Tiendanube sin cancelar la venta local si falla la red.",
      ],
    },
    {
      title: "Visual y usabilidad",
      items: [
        "Foto de perfil ampliada con efecto Liquid Glass.",
        "Mejora visual del recuadro Ventas del dia para no romper la estetica del dashboard.",
      ],
    },
  ],
};

export function getReleaseNotesForVersion(version: string): ReleaseNoteSection[] {
  const normalized = version.trim().replace(/^v/i, "");
  return RELEASE_NOTES[normalized] ?? [];
}

export function parseReleaseBody(body: string | null): ReleaseNoteSection[] {
  if (!body?.trim()) return [];

  const sections: ReleaseNoteSection[] = [];
  let current: ReleaseNoteSection | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      current = { title: heading[1].trim(), items: [] };
      sections.push(current);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!current) {
        current = { title: "Cambios incluidos", items: [] };
        sections.push(current);
      }
      current.items.push(bullet[1].trim());
      continue;
    }

    if (!current) {
      current = { title: "Detalle de la actualizacion", items: [] };
      sections.push(current);
    }
    current.items.push(line.replace(/^\d+\.\s+/, ""));
  }

  return sections.filter((section) => section.items.length > 0);
}