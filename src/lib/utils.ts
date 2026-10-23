import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import type { CategoriaTreeNode } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface CategoriaOption {
  id: number;
  value: string;
  label: string;
  tnCategoryId: number | null;
  depth: number;
  path: string[];
}

export function flattenCategoriaTreeOptions(tree: CategoriaTreeNode[], depth = 0, parentPath: string[] = []): CategoriaOption[] {
  return tree.flatMap((node) => {
    const path = [...parentPath, node.nombre];
    const labelPrefix = depth > 0 ? `${"—".repeat(depth)} ` : "";
    const option: CategoriaOption = {
      id: node.id,
      value: path.join(" / "),
      label: `${labelPrefix}${path.join(" / ")}`,
      tnCategoryId: node.tnCategoryId,
      depth,
      path,
    };

    return [option, ...flattenCategoriaTreeOptions(node.hijos, depth + 1, path)];
  });
}
