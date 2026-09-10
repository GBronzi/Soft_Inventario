import { describe, expect, it } from "vitest";

import { flattenCategoriaTreeOptions } from "@/lib/utils";
import type { CategoriaTreeNode } from "@/types";

describe("flattenCategoriaTreeOptions", () => {
  it("construye etiquetas jerárquicas para el selector de categorías", () => {
    const tree: CategoriaTreeNode[] = [
      {
        id: 1,
        tnCategoryId: 10,
        nombre: "Perfumes",
        tnParentId: null,
        hijos: [
          {
            id: 2,
            tnCategoryId: 11,
            nombre: "Hombre",
            tnParentId: 10,
            hijos: [
              {
                id: 3,
                tnCategoryId: 12,
                nombre: "Edición Limitada",
                tnParentId: 11,
                hijos: [],
              },
            ],
          },
        ],
      },
      {
        id: 4,
        tnCategoryId: 13,
        nombre: "Ropa",
        tnParentId: null,
        hijos: [],
      },
    ];

    expect(flattenCategoriaTreeOptions(tree)).toEqual([
      { id: 1, label: "Perfumes", value: "Perfumes", tnCategoryId: 10, depth: 0, path: ["Perfumes"] },
      { id: 2, label: "— Perfumes / Hombre", value: "Perfumes / Hombre", tnCategoryId: 11, depth: 1, path: ["Perfumes", "Hombre"] },
      { id: 3, label: "—— Perfumes / Hombre / Edición Limitada", value: "Perfumes / Hombre / Edición Limitada", tnCategoryId: 12, depth: 2, path: ["Perfumes", "Hombre", "Edición Limitada"] },
      { id: 4, label: "Ropa", value: "Ropa", tnCategoryId: 13, depth: 0, path: ["Ropa"] },
    ]);
  });
});
