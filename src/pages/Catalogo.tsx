import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Boxes, PackageSearch, Filter, LayoutGrid, List, Search, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCatalogoFilterOptions, getCatalogoProductos } from "@/database/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { TIENDANUBE_SYNCED_EVENT } from "@/hooks/useTiendanubeSync";
import type { CatalogoFilterOptions, CatalogoItem, EstadoInventario } from "@/types";

type CatalogoFiltersState = {
  search: string;
  categoria: string;
  marca: string;
  estado: EstadoInventario | "TODOS";
  soloBajoStock: boolean;
  soloConVariantes: boolean;
};

type ProductoAgrupado = CatalogoItem & {
  variantesGrupo: CatalogoItem[];
  tieneBajoStock: boolean;
};

function getVariantLabel(variante: CatalogoItem) {
  const values = [variante.variante, variante.capacidadMedida]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const uniqueValues = values.filter(
    (value, index) => values.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index,
  );
  return uniqueValues.join(" · ") || "Principal";
}


export function Catalogo() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [productos, setProductos] = useState<CatalogoItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [options, setOptions] = useState<CatalogoFilterOptions>({ categorias: [], marcas: [] });
  const [viewType, setViewType] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("catalogo_view_type") as "grid" | "list") || "grid";
  });

  const toggleView = (type: "grid" | "list") => {
    setViewType(type);
    localStorage.setItem("catalogo_view_type", type);
  };

  // Read filters from URL
  const filters: CatalogoFiltersState = useMemo(() => ({
    search: searchParams.get("search") ?? "",
    categoria: searchParams.get("categoria") ?? "",
    marca: searchParams.get("marca") ?? "",
    estado: (searchParams.get("estado") as any) ?? "TODOS",
    soloBajoStock: searchParams.get("bajoStock") === "1",
    soloConVariantes: searchParams.get("conVariantes") === "1",
  }), [searchParams]);

  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput);

  const hasActiveFilters = filters.search || filters.categoria || filters.marca || filters.estado !== "TODOS" || filters.soloBajoStock || filters.soloConVariantes;

  const productosAgrupados = useMemo<ProductoAgrupado[]>(() => {
    const groups = new Map<number, CatalogoItem[]>();
    productos.forEach((item) => groups.set(item.productoId, [...(groups.get(item.productoId) ?? []), item]));
    return Array.from(groups.values()).map((variantesGrupo) => {
      const base = variantesGrupo[0];
      return {
        ...base,
        variantesGrupo,
        tieneBajoStock: variantesGrupo.some((item) => item.stockActual <= item.stockMinimo),
      };
    });
  }, [productos]);

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  });

  useEffect(() => {
    void getCatalogoFilterOptions().then(setOptions);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.categoria) params.set("categoria", filters.categoria);
    if (filters.marca) params.set("marca", filters.marca);
    if (filters.estado !== "TODOS") params.set("estado", filters.estado);
    if (filters.soloBajoStock) params.set("bajoStock", "1");
    if (filters.soloConVariantes) params.set("conVariantes", "1");
    
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, filters.categoria, filters.marca, filters.estado, filters.soloBajoStock, filters.soloConVariantes, setSearchParams]);

  useEffect(() => {
    async function load() {
      const rows = await getCatalogoProductos({
        search: filters.search,
        categoria: filters.categoria,
        marca: filters.marca,
        estado: filters.estado === "TODOS" ? undefined : filters.estado,
        soloBajoStock: filters.soloBajoStock,
        soloConVariantes: filters.soloConVariantes,
      });
      setProductos(rows);
    }
    void load();
  }, [filters, refreshKey]);

  useEffect(() => {
    const onSynced = () => {
      setRefreshKey((k) => k + 1);
      void getCatalogoFilterOptions().then(setOptions);
    };
    window.addEventListener(TIENDANUBE_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(TIENDANUBE_SYNCED_EVENT, onSynced);
  }, []);

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Filtros */}
        <aside className="w-full lg:w-80 shrink-0 space-y-4">
          <Card className="border-none shadow-xl bg-card/50 backdrop-blur-md">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="size-4" /> Filtros
                </CardTitle>
                <CardDescription>Refina tu búsqueda</CardDescription>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-8 w-8 text-rose-500">
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-4 border-t border-border/50">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Buscador</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-9 rounded-xl bg-background/50 border-border/50 focus:ring-primary/20"
                    placeholder="Nombre, SKU..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categoría</label>
                <select
                  className="w-full rounded-xl border border-border/50 bg-background/50 p-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={filters.categoria}
                  onChange={(e) => {
                    const p = new URLSearchParams(searchParams);
                    if (e.target.value) p.set("categoria", e.target.value); else p.delete("categoria");
                    setSearchParams(p);
                  }}
                >
                  <option value="">Todas</option>
                  {options.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Marca</label>
                <select
                  className="w-full rounded-xl border border-border/50 bg-background/50 p-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  value={filters.marca}
                  onChange={(e) => {
                    const p = new URLSearchParams(searchParams);
                    if (e.target.value) p.set("marca", e.target.value); else p.delete("marca");
                    setSearchParams(p);
                  }}
                >
                  <option value="">Todas</option>
                  {options.marcas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estado</label>
                <div className="flex flex-wrap gap-2">
                  {["TODOS", "ACTIVO", "PAUSADO", "DISCONTINUADO"].map(e => (
                    <Button
                      key={e}
                      variant={filters.estado === e ? "default" : "outline"}
                      size="sm"
                      className="text-[10px] h-7 px-2 rounded-lg"
                      onClick={() => {
                        const p = new URLSearchParams(searchParams);
                        if (e !== "TODOS") p.set("estado", e); else p.delete("estado");
                        setSearchParams(p);
                      }}
                    >
                      {e}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                variant={filters.soloBajoStock ? "destructive" : "outline"}
                className="w-full rounded-xl text-xs"
                onClick={() => {
                  const p = new URLSearchParams(searchParams);
                  if (!filters.soloBajoStock) p.set("bajoStock", "1"); else p.delete("bajoStock");
                  setSearchParams(p);
                }}
              >
                {filters.soloBajoStock ? "Ver todo el stock" : "Ver solo bajo stock"}
              </Button>

              <Button
                variant={filters.soloConVariantes ? "default" : "outline"}
                className="w-full rounded-xl text-xs"
                onClick={() => {
                  const p = new URLSearchParams(searchParams);
                  if (!filters.soloConVariantes) p.set("conVariantes", "1"); else p.delete("conVariantes");
                  setSearchParams(p);
                }}
              >
                {filters.soloConVariantes ? "Ver todos" : "Ver solo con variantes"}
              </Button>
            </CardContent>
          </Card>
        </aside>

        {/* Listado de Productos */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between bg-card/30 p-4 rounded-2xl backdrop-blur-sm border border-border/50">
            <h3 className="text-sm font-medium text-muted-foreground">
              Hemos encontrado <span className="text-foreground font-bold">{productosAgrupados.length}</span> productos · {productos.length} variantes
            </h3>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 rounded-lg transition-all ${viewType === "grid" ? "bg-background shadow-sm border border-border/50" : "opacity-40 hover:opacity-100"}`}
                onClick={() => toggleView("grid")}
              >
                <LayoutGrid className="size-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 rounded-lg transition-all ${viewType === "list" ? "bg-background shadow-sm border border-border/50" : "opacity-40 hover:opacity-100"}`}
                onClick={() => toggleView("list")}
              >
                <List className="size-4" />
              </Button>
            </div>
          </div>

          {productosAgrupados.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/50 bg-muted/10">
              <PackageSearch className="size-16 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-medium">No hay resultados para esta búsqueda</p>
              <Button variant="link" onClick={handleClearFilters}>Limpiar filtros</Button>
            </div>
          ) : viewType === "grid" ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {productosAgrupados.map((producto) => (
                <Card key={producto.productoId} className="group flex flex-col overflow-hidden rounded-3xl border-none bg-card/40 shadow-lg transition-all hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1">
                  <div className="relative aspect-[3/3] overflow-hidden bg-muted/30">
                    {(() => {
                      const imgSrc = producto.imagenPathLocal
                        ? convertFileSrc(producto.imagenPathLocal)
                        : producto.imagenUrl;
                      return imgSrc ? (
                        <>
                          <img
                            aria-hidden
                            src={imgSrc}
                            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
                          />
                          <img
                            alt={producto.nombre}
                            className="relative h-full w-full object-contain transition-transform duration-700 group-hover:scale-105"
                            src={imgSrc}
                          />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/10">
                          <Boxes className="size-24" />
                        </div>
                      );
                    })()}
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                       <Badge variant={producto.estado === "ACTIVO" ? "default" : "secondary"} className="shadow-lg font-bold border-none px-3">
                        {producto.estado}
                      </Badge>
                      {producto.tieneBajoStock && (
                        <Badge variant="destructive" className="animate-pulse shadow-lg font-bold">REPOSICIÓN</Badge>
                      )}
                    </div>
                  </div>

                  <CardHeader className="pb-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">{producto.marca}</p>
                      <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">{producto.nombre}</CardTitle>
                      <CardDescription>{producto.variantesGrupo.length} {producto.variantesGrupo.length === 1 ? "variante" : "variantes"}</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4 flex flex-col justify-end">
                    <div className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[9px] font-bold uppercase text-muted-foreground">
                        <span>Variante</span>
                        <span>Precio</span>
                        <span className="text-right">Stock</span>
                      </div>
                      {producto.variantesGrupo.map((variante) => (
                        <button key={variante.inventarioId} type="button" onClick={() => navigate(`/producto/${variante.inventarioId}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-[11px] transition-colors last:border-b-0 hover:bg-primary/5 hover:text-primary" title={`Abrir ${getVariantLabel(variante)}`}>
                          <span className="min-w-0 truncate font-bold">{getVariantLabel(variante)}</span>
                          <span className="font-semibold tabular-nums">{currencyFormatter.format(variante.precioVenta)}</span>
                          <span className={`min-w-12 text-right font-black tabular-nums ${variante.stockActual <= variante.stockMinimo ? "text-rose-500" : "text-emerald-600"}`}>{variante.stockActual} u.</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="rounded-xl h-9"
                        onClick={() => navigate(`/producto/${producto.inventarioId}`)}
                      >
                        Detalle
                      </Button>
                      <Button 
                        size="sm" 
                        className="rounded-xl h-9"
                        onClick={() => navigate(`/producto/${producto.inventarioId}/editar`)}
                      >
                        Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {productosAgrupados.map((producto) => (
                <div 
                  key={producto.productoId}
                  className="group flex flex-col md:flex-row items-center gap-4 p-3 bg-card/40 rounded-2xl border border-border/50 hover:bg-card/60 transition-all hover:shadow-lg hover:border-primary/20"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted/30">
                    {producto.imagenPathLocal ? (
                      <img
                        alt={producto.nombre}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        src={convertFileSrc(producto.imagenPathLocal)}
                      />
                    ) : producto.imagenUrl ? (
                      <img
                        alt={producto.nombre}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        src={producto.imagenUrl}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/10">
                        <Boxes className="size-8" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary/60">{producto.marca}</p>
                      <Badge variant={producto.estado === "ACTIVO" ? "default" : "secondary"} className="text-[8px] h-4 px-1.5 font-bold border-none uppercase">
                        {producto.estado}
                      </Badge>
                      {producto.tieneBajoStock && (
                        <Badge variant="destructive" className="text-[8px] h-4 px-1.5 font-bold animate-pulse">BAJO STOCK</Badge>
                      )}
                    </div>
                    <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{producto.nombre}</h4>
                    <p className="text-xs text-muted-foreground">{producto.variantesGrupo.length} {producto.variantesGrupo.length === 1 ? "variante" : "variantes"}</p>
                  </div>

                  <div className="w-full overflow-hidden rounded-lg border border-border/50 md:w-[28rem]">
                    {producto.variantesGrupo.map((variante) => (
                      <button key={variante.inventarioId} type="button" onClick={() => navigate(`/producto/${variante.inventarioId}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-primary/5" title="Abrir variante">
                        <span className="truncate font-bold">{getVariantLabel(variante)}</span>
                        <span className="font-semibold tabular-nums">{currencyFormatter.format(variante.precioVenta)}</span>
                        <span className={`min-w-12 text-right font-black tabular-nums ${variante.stockActual <= variante.stockMinimo ? "text-rose-500" : "text-emerald-600"}`}>{variante.stockActual} u.</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 pl-2">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-9 w-9 rounded-xl hover:bg-primary/10 transition-colors"
                      onClick={() => navigate(`/producto/${producto.inventarioId}`)}
                    >
                      <PackageSearch className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
