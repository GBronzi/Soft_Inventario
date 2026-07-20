import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAplicarPrecioDesdeTiendanube, mockAplicarStockDesdeTiendanube, mockGetCatalogoProductos, mockGetCategoriasArbol, mockFetch, mockUpsertCategorias } = vi.hoisted(() => ({
  mockAplicarPrecioDesdeTiendanube: vi.fn(),
  mockAplicarStockDesdeTiendanube: vi.fn(),
  mockGetCatalogoProductos: vi.fn(),
  mockGetCategoriasArbol: vi.fn(),
  mockFetch: vi.fn(),
  mockUpsertCategorias: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

vi.mock("@/database/queries", () => ({
  aplicarPrecioDesdeTiendanube: mockAplicarPrecioDesdeTiendanube,
  aplicarStockDesdeTiendanube: mockAplicarStockDesdeTiendanube,
  getCatalogoProductos: mockGetCatalogoProductos,
  getCategoriasArbol: mockGetCategoriasArbol,
  setTnUpdatedAt: vi.fn(),
  upsertCategorias: mockUpsertCategorias,
  upsertProductoDesdeTiendanube: vi.fn(),
}));

import { buildTiendanubeProductPayload, buildTiendanubeVariantPayload, buildTiendanubeSyncFeedbackMessage, resolveTiendanubeCategoryIds, resolveTiendanubeProductTarget, revisarCambiosTiendanube, runIncrementalSync, validateTiendanubeConnection } from "@/api/tiendanube";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
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
      name: "Perfume nuevo",
      description: "Descripción",
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
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const preview = await revisarCambiosTiendanube(() => undefined);

    expect(preview.cambios.map((cambio) => cambio.type)).toEqual(["VENTA_TN", "PRECIO"]);
    expect(preview.cambios[0].detalle).toContain("Venta/s Tiendanube #101");
    expect(preview.signature).toContain("venta-10-20");
    expect(mockAplicarStockDesdeTiendanube).not.toHaveBeenCalled();
    expect(mockAplicarPrecioDesdeTiendanube).not.toHaveBeenCalled();
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
    mockGetCatalogoProductos.mockResolvedValue([{ inventarioId: 7, productoId: 1, nombre: "Perfume", descripcion: "", categoria: null, marca: null, notas: null, imagenPathLocal: null, imagenUrl: null, seoTitulo: null, seoDescripcion: null, tags: null, publicado: 1, tnProductId: 10, tnVariantId: 20, variante: "100 ml", capacidadMedida: "100 ml", sku: "SKU-1", codigoBarras: null, stockActual: 5, stockMinimo: 0, precioCompra: 0, precioVenta: 100, ubicacion: null, lote: null, vencimiento: null, estado: "ACTIVO", tnCategoryIds: [] }]);

    const result = await runIncrementalSync(() => undefined);

    expect(result.procesados).toBe(1);
    const productReviewUrl = String(mockFetch.mock.calls[2][0]);
    expect(productReviewUrl).toContain("/products?");
    expect(productReviewUrl).not.toContain("updated_at_min");
  });
});