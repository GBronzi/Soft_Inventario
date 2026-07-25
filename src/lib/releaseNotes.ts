export interface ReleaseNoteSection {
  title: string;
  items: string[];
}

const RELEASE_NOTES: Record<string, ReleaseNoteSection[]> = {
  "1.1.2": [
    {
      title: "Operacion de caja",
      items: [
        "Se corrige el error al confirmar Nueva venta: cannot start a transaction within a transaction.",
        "La venta multiple ya no abre una transaccion manual incompatible con el pool SQLite de Tauri.",
        "Se mantiene el registro de venta, detalle, Kardex, descuento de stock y envio posterior de stock a Tiendanube.",
      ],
    },
  ],
  "1.1.1": [
    {
      title: "Sincronizacion Tiendanube",
      items: [
        "Los cambios hechos desde el programa hacia Tiendanube se tratan como salida automatica y no requieren aprobacion manual.",
        "Se preserva la imagen remota de Tiendanube al editar productos desde el programa.",
        "El programa actualiza el puente local con la imagen remota devuelta por Tiendanube cuando sincroniza un producto.",
      ],
    },
    {
      title: "Apariencia",
      items: [
        "Nueva opcion Apariencia y resolucion en Configuracion para ajustar texto, botones y espacios segun la pantalla del cliente.",
        "Se agregan modos Pantalla chica, Estandar y Pantalla grande con preferencia guardada en esta computadora.",
      ],
    },
  ],  "1.1.0": [
    {
      title: "Sincronizacion Tiendanube",
      items: [
        "Nueva ventana Sincronizacion para revisar cambios antes de aplicarlos al stock local.",
        "Deteccion de productos nuevos, variantes nuevas, diferencias de stock, precio, datos y visibilidad.",
        "Lectura de ventas recientes de Tiendanube para identificar bajas de stock como Venta Tiendanube cuando hay una orden asociada.",
        "Aplicacion seleccionada: el cliente decide que cambios tomar desde Tiendanube.",
        "Bridge de webhooks: Tiendanube puede avisar ventas, productos y modificaciones mientras el programa esta abierto.",
        "Los eventos del bridge se verifican contra la API antes de mostrar cambios para reducir falsos positivos.",
      ],
    },
    {
      title: "Conexion y avisos",
      items: [
        "Validacion real del token contra la API de Tiendanube para evitar estado conectado falso.",
        "Aviso superior cuando hay cambios pendientes, sin repetir el mismo aviso si el operador lo cierra.",
        "Aviso de revinculacion solo cuando Tiendanube rechaza la autorizacion; los fallos temporales de internet se reintentan antes de alertar.",
        "La deteccion automatica no modifica stock por detras: solo avisa y dirige a Sincronizacion.",
        "La deteccion automatica ahora compara el catalogo completo para detectar cambios manuales de stock aunque Tiendanube no envie webhook de producto.",
        "Boton Reparar avisos automaticos para registrar nuevamente los webhooks si la tienda fue revinculada o cambio la autorizacion.",
      ],
    },
    {
      title: "Permisos",
      items: [
        "Se agrega permiso write_orders para leer ventas y registrar avisos de pedidos de Tiendanube. Las tiendas vinculadas con versiones anteriores deben desvincular y volver a vincular una vez.",
        "El bridge en Vercel requiere TIENDANUBE_CLIENT_SECRET, KV_REST_API_URL y KV_REST_API_TOKEN configurados para guardar eventos pendientes.",
      ],
    },
  ],
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
