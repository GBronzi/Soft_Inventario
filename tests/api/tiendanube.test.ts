import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCategoriasArbol, mockFetch } = vi.hoisted(() => ({
  mockGetCategoriasArbol: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

vi.mock("@/database/queries", () => ({
  getCatalogoProductos: vi.fn(),
  getCategoriasArbol: mockGetCategoriasArbol,
  setTnUpdatedAt: vi.fn(),
  upsertCategorias: vi.fn(),
  upsertProductoDesdeTiendanube: vi.fn(),
}));

import { buildTiendanubeProductPayload, buildTiendanubeVariantPayload, buildTiendanubeSyncFeedbackMessage, resolveTiendanubeCategoryIds, resolveTiendanubeProductTarget } from "@/api/tiendanube";

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
