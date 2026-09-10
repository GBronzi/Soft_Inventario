import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAplicarPrecioDesdeTiendanube, mockAplicarStockDesdeTiendanube, mockGetCatalogoProductos, mockGetCategoriasArbol, mockFetch, mockHasActiveMovimientoStockOperacion, mockSetTnUpdatedAt, mockUpsertCategorias, mockUpsertProductoDesdeTiendanube, mockQueueDb, pendingQueue } = vi.hoisted(() => ({
  mockAplicarPrecioDesdeTiendanube: vi.fn(),
  mockAplicarStockDesdeTiendanube: vi.fn(),
  mockGetCatalogoProductos: vi.fn(),
  mockGetCategoriasArbol: vi.fn(),
  mockFetch: vi.fn(),
  mockHasActiveMovimientoStockOperacion: vi.fn(),
  mockSetTnUpdatedAt: vi.fn(),
  mockUpsertCategorias: vi.fn(),
  mockUpsertProductoDesdeTiendanube: vi.fn(),
  pendingQueue: [] as Array<{ id: number; changeKey: string; payloadJson: string; productPayloadJson: string | null; estado: string; detectadoEn: string }>,
  mockQueueDb: {
    execute: vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes("INSERT OR IGNORE INTO tiendanube_cambios_pendientes")) {
        const changeKey = String(params?.[0] ?? "");
        if (!pendingQueue.some((row) => row.changeKey === changeKey)) {
          pendingQueue.push({
            id: pendingQueue.length + 1,
            changeKey,
            payloadJson: String(params?.[4] ?? "{}"),
            productPayloadJson: params?.[5] == null ? null : String(params[5]),
            estado: "PENDIENTE",
            detectadoEn: "2026-07-20 10:00:00",
          });
        }
      }
      if (query.includes("UPDATE tiendanube_cambios_pendientes")) {
        if (query.includes("tn_product_id = $1") && query.includes("tn_variant_id = $2")) {
          const tnProductId = Number(params?.[0] ?? 0);
          const tnVariantId = Number(params?.[1] ?? 0);
          const types = new Set((params ?? []).slice(2).map(String));
          for (const row of pendingQueue) {
            const payload = JSON.parse(row.payloadJson);
            if (payload.tnProductId === tnProductId && payload.tnVariantId === tnVariantId && types.has(payload.type)) {
              row.estado = "IGNORADO";
            }
          }
        } else {
          const id = Number(params?.[1] ?? 0);
          const row = pendingQueue.find((item) => item.id === id);
          if (row) row.estado = String(params?.[0] ?? row.estado);
        }
      }
      return { rowsAffected: 1 };
    }),
    select: vi.fn(async () => pendingQueue
      .filter((row) => row.estado === "PENDIENTE")
      .map((row) => ({
        id: row.id,
        payloadJson: row.payloadJson,
        productPayloadJson: row.productPayloadJson,
        detectadoEn: row.detectadoEn,
      }))),
  },
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

vi.mock("@/database/queries", () => ({
  aplicarPrecioDesdeTiendanube: mockAplicarPrecioDesdeTiendanube,
  aplicarStockDesdeTiendanube: mockAplicarStockDesdeTiendanube,
  getCatalogoProductos: mockGetCatalogoProductos,
  getCategoriasArbol: mockGetCategoriasArbol,
  hasActiveMovimientoStockOperacion: mockHasActiveMovimientoStockOperacion,
  setTnUpdatedAt: mockSetTnUpdatedAt,
  upsertCategorias: mockUpsertCategorias,
  upsertProductoDesdeTiendanube: mockUpsertProductoDesdeTiendanube,
}));

vi.mock("@/database/db", () => ({
  getDatabase: vi.fn(async () => mockQueueDb),
}));

import { aplicarCambiosSeleccionadosTiendanube, buildTiendanubeProductMetadataPayload, buildTiendanubeProductPayload, buildTiendanubeVariantPayload, buildTiendanubeSyncFeedbackMessage, enviarDatosLocalesSeleccionadosATiendanube, pushProductoATiendanube, resolveTiendanubeCategoryIds, resolveTiendanubeProductTarget, revisarCambiosTiendanube, runIncrementalSync, validateTiendanubeConnection } from "@/api/tiendanube";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
});

beforeEach(() => {
  pendingQueue.length = 0;
  mockQueueDb.execute.mockClear();
  mockQueueDb.select.mockClear();
  mockHasActiveMovimientoStockOperacion.mockReset();
  mockHasActiveMovimientoStockOperacion.mockResolvedValue(false);
});

describe("buildTiendanubeProductMetadataPayload", () => {
  it("genera solo datos de producto sin stock ni precio", () => {
    const payload = buildTiendanubeProductMetadataPayload({
      nombre: "Perfume editado",
      descripcion: "Descripción local",
      marca: "Marca Local",
      tags: "tag",
      publicado: 1,
      seoTitulo: "SEO",
      seoDescripcion: "SEO desc",
    } as any);

    expect(payload).toEqual({
      name: { es: "Perfume editado" },
      description: { es: "Descripción local" },
      brand: "Marca Local",
      tags: "tag",
      published: true,
      seo_title: "SEO",
      seo_description: "SEO desc",
    });
    expect(payload).not.toHaveProperty("stock");
    expect(payload).not.toHaveProperty("price");
  });
});
describe("buildTiendanubeProductPayload", () => {
  it("genera el cuerpo de creación de producto para un nuevo item local", () => {
    const payload = buildTiendanubeProductPayload({
      nombre: "Perfume nuevo",
      descripcion: "Descripción",
      marca: "Marca X",
      tags: "tag1, tag2",
      publicado: 1,
      seoTitulo: "SEO title",
      seoDescripcion: "SEO desc",
    } as any);

    expect(payload).toEqual({
      name: { es: "Perfume nuevo" },
      description: { es: "Descripción" },
      brand: "Marca X",
      tags: "tag1, tag2",
      published: true,
      seo_title: "SEO title",
      seo_description: "SEO desc",
      price: 0,
      stock: 0,
      sku: null,
      barcode: null,
    });
  });
});

describe("buildTiendanubeVariantPayload", () => {
  it("genera el cuerpo de creación de variante con stock y precio", () => {
    const payload = buildTiendanubeVariantPayload({
      precioVenta: 1500,
      stockActual: 12,
      sku: "SKU-1",
      codigoBarras: "123456",
    } as any);

    expect(payload).toEqual({
      price: "1500",
      stock: 12,
      sku: "SKU-1",
      barcode: "123456",
    });
  });
});

describe("buildTiendanubeSyncFeedbackMessage", () => {
  it("explica cuando el producto se sube pero la categoría no se asigna", () => {
    expect(buildTiendanubeSyncFeedbackMessage({ isEditing: false, categoryAssigned: false })).toBe(
      "Producto creado localmente y subido a Tiendanube, pero la categoría no pudo asignarse."
    );
  });
});


describe("enviarDatosLocalesSeleccionadosATiendanube", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
    mockGetCatalogoProductos.mockReset();
    mockGetCategoriasArbol.mockReset();
    mockSetTnUpdatedAt.mockReset();
  });

  it("resuelve cambios de datos enviando metadatos locales sin tocar variantes", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ id: 10, updated_at: "2026-07-25T10:00:00Z", images: [{ src: "https://cdn.tn/actual.jpg" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ id: 10, name: { es: "Perfume Local" }, description: { es: "Editado en programa" }, brand: "Marca Local", tags: null, published: true, updated_at: "2026-07-25T10:00:00Z", images: [{ src: "https://cdn.tn/actual.jpg" }], categories: [] }),
      });
    mockGetCategoriasArbol.mockResolvedValue([]);
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume Local", descripcion: "Editado en programa", categoria: null, marca: "Marca Local", notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const result = await enviarDatosLocalesSeleccionadosATiendanube({
      cambios: [{ id: "datos-10", type: "DATOS", producto: "Perfume", variante: null, detalle: "Datos diferentes", accion: "Actualizar", tnProductId: 10, tnVariantId: null, inventarioId: 7, localStock: null, remoteStock: null, stockDelta: null, localPrice: null, remotePrice: null }],
      productos: [],
      fetchedAt: "2026-07-25T10:00:00Z",
      signature: "datos-10",
      webhookEventKeys: [],
    }, ["datos-10"], () => undefined);

    expect(result).toEqual({ aplicados: 1, errores: 0 });
    expect(String(mockFetch.mock.calls[0][0])).toContain("/products/10");
    expect(String(mockFetch.mock.calls[0][0])).not.toContain("/variants");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ name: { es: "Perfume Local" }, description: { es: "Editado en programa" }, brand: "Marca Local" });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).not.toHaveProperty("stock");
    expect(mockSetTnUpdatedAt).toHaveBeenCalledWith(10, "2026-07-25T10:00:00Z", "https://cdn.tn/actual.jpg");
  });
});
describe("pushProductoATiendanube", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
    mockGetCatalogoProductos.mockReset();
    mockSetTnUpdatedAt.mockReset();
  });

  it("sube cambios locales automaticamente y conserva el puente de imagen remota", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ id: 10, updated_at: "2026-07-24T10:00:00Z", images: [{ src: "https://cdn.tn/imagen.jpg" }] }),
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => ({ id: 20 }) });

    await expect(pushProductoATiendanube({
      inventarioId: 7,
      productoId: 1,
      nombre: "Perfume",
      descripcion: "Editado local",
      categoria: null,
      marca: null,
      notas: null,
      imagenPathLocal: null,
      imagenUrl: "https://cdn.tn/imagen-vieja.jpg",
      seoTitulo: null,
      seoDescripcion: null,
      tags: null,
      publicado: 1,
      tnProductId: 10,
      tnVariantId: 20,
      variante: "100 ml",
      capacidadMedida: "100 ml",
      sku: "SKU-1",
      codigoBarras: null,
      stockActual: 5,
      stockMinimo: 0,
      precioCompra: 0,
      precioVenta: 100,
      ubicacion: null,
      lote: null,
      vencimiento: null,
      estado: "ACTIVO",
      tnCategoryIds: [],
    })).resolves.toEqual({ categoryAssigned: false });

    expect(mockSetTnUpdatedAt).toHaveBeenCalledWith(10, "2026-07-24T10:00:00Z", "https://cdn.tn/imagen.jpg");
    expect(localStorage.getItem("tiendanube_sync_since")).toBeTruthy();
    expect(localStorage.getItem("tiendanube_auto_check_since")).toBeTruthy();
  });
});
describe("resolveTiendanubeProductTarget", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("reutiliza un producto existente cuando encuentra la misma SKU", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => [{ id: 77, name: { es: "Perfume A" }, variants: [{ id: 99, sku: "SKU-1" }] }],
    });

    await expect(
      resolveTiendanubeProductTarget({ accessToken: "token", userId: "123" }, { nombre: "Perfume A", sku: "SKU-1" } as any),
    ).resolves.toEqual({ productId: 77, variantId: 99 });
  });
});

describe("resolveTiendanubeCategoryIds", () => {
  beforeEach(() => {
    mockGetCategoriasArbol.mockReset();
  });

  it("resuelve la categoría más específica de una ruta jerárquica", async () => {
    mockGetCategoriasArbol.mockResolvedValue([
      {
        id: 1,
        tnCategoryId: 10,
        nombre: "Perfumes",
        tnParentId: null,
        hijos: [
          {
            id: 2,
            tnCategoryId: 11,
            nombre: "Árabes Original",
            tnParentId: 10,
            hijos: [
              {
                id: 3,
                tnCategoryId: 42,
                nombre: "Unisex",
                tnParentId: 11,
                hijos: [],
              },
            ],
          },
        ],
      },
    ]);

    await expect(
      resolveTiendanubeCategoryIds({ categoria: "Perfumes / Árabes Original / Unisex", tnCategoryIds: [] }),
    ).resolves.toEqual([42]);
  });
});

describe("validateTiendanubeConnection", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
  });

  it("marca la conexión como inválida cuando Tiendanube rechaza el token", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "viejo", userId: "123" }));
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ message: "Invalid token" }),
    });

    await expect(validateTiendanubeConnection()).resolves.toMatchObject({
      ok: false,
      statusCode: 401,
      message: expect.stringContaining("vuelve a vincular"),
    });
  });
});

describe("revisarCambiosTiendanube", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
    mockGetCatalogoProductos.mockReset();
    mockUpsertCategorias.mockReset();
  });

  it("no marca Datos cuando descripcion HTML y categoria vinculada equivalen al dato local", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [{ id: 30, name: { es: "Perfumes" }, parent: null }] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Athenea" },
          description: { es: "<p>Descripción local</p>" },
          brand: "Marca Local",
          published: true,
          categories: [{ id: 30, name: { es: "Perfumes" }, parent: null }],
          variants: [{ id: 20, product_id: 10, price: "100", stock: 5, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] });
    mockUpsertCategorias.mockResolvedValue(new Map([[30, 3]]));
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Athenea", descripcion: "Descripción local", categoria: "Perfumes", marca: "Marca Local", notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube(() => undefined);

    expect(preview.cambios).toHaveLength(0);
  });

  it("detecta y aplica imagen faltante desde Tiendanube sin tocar otros datos", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Perfume" },
          description: { es: "" },
          updated_at: "2026-07-25T10:00:00Z",
          images: [{ src: "https://cdn.tn/perfume.jpg" }],
          variants: [{ id: 20, product_id: 10, price: "100", stock: 5, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-25T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube(() => undefined);

    expect(preview.cambios).toHaveLength(1);
    expect(preview.cambios[0]).toMatchObject({ type: "IMAGEN" });
    expect(preview.cambios[0].id).toContain("imagen-10");

    await aplicarCambiosSeleccionadosTiendanube(preview, [preview.cambios[0].id], () => undefined);

    expect(mockSetTnUpdatedAt).toHaveBeenCalledWith(10, "2026-07-25T10:00:00Z", "https://cdn.tn/perfume.jpg");
    expect(mockUpsertProductoDesdeTiendanube).not.toHaveBeenCalled();
    expect(mockAplicarStockDesdeTiendanube).not.toHaveBeenCalled();
    expect(mockAplicarPrecioDesdeTiendanube).not.toHaveBeenCalled();
  });
  it("detecta ventas de Tiendanube, stock y precio sin aplicar cambios locales", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Perfume" },
          description: { es: "" },
          variants: [{ id: 20, product_id: 10, price: "120", stock: 3, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 500,
          number: 101,
          status: "open",
          payment_status: "paid",
          total: "120",
          created_at: "2026-07-20T10:00:00Z",
          products: [{ product_id: 10, variant_id: 20, quantity: 2 }],
        }],
      });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube(() => undefined);

    expect(preview.cambios.map((cambio) => cambio.type)).toEqual(["VENTA_TN", "PRECIO"]);
    expect(preview.cambios[0].detalle).toContain("Venta/s Tiendanube #101");
    expect(preview.signature).toContain("venta-10-20");
    expect(mockAplicarStockDesdeTiendanube).not.toHaveBeenCalled();
    expect(mockAplicarPrecioDesdeTiendanube).not.toHaveBeenCalled();
  });

  it("no descuenta stock local por orden Tiendanube pendiente o no pagada", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    const logs: string[] = [];
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Perfume" },
          description: { es: "" },
          variants: [{ id: 20, product_id: 10, price: "100", stock: 3, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 500,
          number: 101,
          status: "open",
          payment_status: "pending",
          total: "200",
          created_at: "2026-07-20T10:00:00Z",
          products: [{ product_id: 10, variant_id: 20, quantity: 2 }],
        }],
      });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube((message) => logs.push(message));

    expect(preview.cambios).toHaveLength(0);
    expect(preview.signature).toBe("");
    expect(logs.some((message) => message.includes("pendiente/no pagada"))).toBe(true);
    expect(mockAplicarStockDesdeTiendanube).not.toHaveBeenCalled();
  });

  it("preserva el ajuste remoto previo cuando llega una venta Tiendanube pagada", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Perfume" },
          description: { es: "" },
          variants: [{ id: 20, product_id: 10, price: "100", stock: 9, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 500,
          number: 101,
          status: "open",
          payment_status: "paid",
          total: "100",
          created_at: "2026-07-20T10:00:00Z",
          products: [{ product_id: 10, variant_id: 20, quantity: 1 }],
        }],
      });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube(() => undefined);

    expect(preview.cambios).toHaveLength(1);
    expect(preview.cambios[0]).toMatchObject({ type: "VENTA_TN", localStock: 5, remoteStock: 9, stockDelta: 4 });
    expect(preview.cambios[0].detalle).toContain("ajuste previo pendiente");

    const result = await aplicarCambiosSeleccionadosTiendanube(preview, [preview.cambios[0].id], () => undefined);

    expect(result).toEqual({ aplicados: 1, errores: 0 });
    expect(mockAplicarStockDesdeTiendanube).toHaveBeenCalledTimes(2);
    expect(mockAplicarStockDesdeTiendanube).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inventarioId: 7,
      stock: 10,
      referencia: "TN-P10-V20-PREVENTA",
    }));
    expect(mockAplicarStockDesdeTiendanube).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inventarioId: 7,
      stock: 9,
      tipoMovimiento: "SALIDA",
      concepto: "VENTA",
      referencia: "Tiendanube #101",
      importeTotal: 100,
    }));
  });

  it("mantiene cambios pendientes anteriores cuando llega otro cambio del mismo producto", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    const productWithStock = (stock: number) => ({
      id: 10,
      name: { es: "Perfume" },
      description: { es: "" },
      variants: [{ id: 20, product_id: 10, price: "100", stock, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
    });
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [productWithStock(8)] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [productWithStock(10)] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    await revisarCambiosTiendanube(() => undefined);
    const secondPreview = await revisarCambiosTiendanube(() => undefined);

    expect(secondPreview.cambios).toHaveLength(2);
    expect(secondPreview.cambios.map((cambio) => cambio.remoteStock)).toEqual([8, 10]);
    expect(new Set(secondPreview.cambios.map((cambio) => cambio.id)).size).toBe(2);

    await expect(aplicarCambiosSeleccionadosTiendanube(secondPreview, [secondPreview.cambios[1].id], () => undefined))
      .rejects.toThrow("cambios anteriores pendientes");
  });

  it("oculta diferencias de stock pendientes cuando Tiendanube ya coincide con el programa", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    const productWithStock = (stock: number) => ({
      id: 10,
      name: { es: "Perfume" },
      description: { es: "" },
      variants: [{ id: 20, product_id: 10, price: "100", stock, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
    });
    const localItem = (stockActual: number) => [{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }];
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [productWithStock(6)] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [productWithStock(4)] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos
      .mockResolvedValueOnce(localItem(4))
      .mockResolvedValueOnce(localItem(4));

    const firstPreview = await revisarCambiosTiendanube(() => undefined);
    const secondPreview = await revisarCambiosTiendanube(() => undefined);

    expect(firstPreview.cambios).toHaveLength(1);
    expect(firstPreview.cambios[0]).toMatchObject({ type: "STOCK", localStock: 4, remoteStock: 6 });
    expect(secondPreview.cambios).toHaveLength(0);
    expect(pendingQueue[0].estado).toBe("IGNORADO");
  });

  it("la revision automatica compara catalogo completo para detectar stock manual sin webhook", async () => {
    localStorage.setItem("tiendanube_credentials", JSON.stringify({ accessToken: "token", userId: "123" }));
    localStorage.setItem("tiendanube_auto_check_since", "2026-07-20T10:00:00.000Z");
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{
          id: 10,
          name: { es: "Perfume" },
          description: { es: "" },
          variants: [{ id: 20, product_id: 10, price: "100", stock: 8, sku: "SKU-1", barcode: null, values: [{ es: "100 ml" }] }],
        }],
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => [] });
    mockUpsertCategorias.mockResolvedValue(new Map());
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnUpdatedAt: "2026-07-24T10:00:00Z", tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const result = await runIncrementalSync(() => undefined);

    expect(result.procesados).toBe(1);
    const productReviewUrl = String(mockFetch.mock.calls[2][0]);
    expect(productReviewUrl).toContain("/products?");
    expect(productReviewUrl).not.toContain("updated_at_min");
  });
});
