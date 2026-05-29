import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Boxes, PackageSearch, Filter, LayoutGrid, List, Search, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteInventarioSeguro, getCatalogoFilterOptions, getCatalogoProductos } from "@/database/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { CatalogoFilterOptions, CatalogoItem, EstadoInventario } from "@/types";

type CatalogoFiltersState = {
  search: string;
  categoria: string;
  marca: string;
  estado: EstadoInventario | "TODOS";
  soloBajoStock: boolean;
};


export function Catalogo() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [productos, setProductos] = useState<CatalogoItem[]>([]);
  const [options, setOptions] = useState<CatalogoFilterOptions>({ categorias: [], marcas: [] });
  const [status, setStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
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
  }), [searchParams]);

  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput);

  const hasActiveFilters = filters.search || filters.categoria || filters.marca || filters.estado !== "TODOS" || filters.soloBajoStock;

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
    
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, filters.categoria, filters.marca, filters.estado, filters.soloBajoStock, setSearchParams]);

  useEffect(() => {
    async function load() {
      const rows = await getCatalogoProductos({
        search: filters.search,
        categoria: filters.categoria,
        marca: filters.marca,
        estado: filters.estado === "TODOS" ? undefined : filters.estado,
        soloBajoStock: filters.soloBajoStock,
      });
      setProductos(rows);
    }
    void load();
  }, [filters]);

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const handleDelete = async (producto: CatalogoItem) => {
    if (!window.confirm(`¿Eliminar ${producto.nombre} (${producto.variante})?`)) return;
    
    setIsDeleting(producto.inventarioId);
    try {
      await deleteInventarioSeguro(producto.inventarioId);
      setProductos(prev => prev.filter(p => p.inventarioId !== producto.inventarioId));
      setStatus("Producto eliminado correctamente");
    } catch (e: any) {
      const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
      setStatus(`Error: ${msg}`);
    } finally {
      setIsDeleting(null);
    }
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
            </CardContent>
          </Card>
        </aside>

        {/* Listado de Productos */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between bg-card/30 p-4 rounded-2xl backdrop-blur-sm border border-border/50">
            <h3 className="text-sm font-medium text-muted-foreground">
              Hemos encontrado <span className="text-foreground font-bold">{productos.length}</span> variantes
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

          {status && (
            <div className={`p-3 rounded-xl border text-xs font-bold text-center animate-in slide-in-from-top-2 ${status.includes("Error") ? "bg-rose-500/10 border-rose-500/50 text-rose-500" : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"}`}>
              {status}
            </div>
          )}

          {productos.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/50 bg-muted/10">
              <PackageSearch className="size-16 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground font-medium">No hay resultados para esta búsqueda</p>
              <Button variant="link" onClick={handleClearFilters}>Limpiar filtros</Button>
            </div>
          ) : viewType === "grid" ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {productos.map((producto) => (
                <Card key={producto.inventarioId} className="group flex flex-col overflow-hidden rounded-3xl border-none bg-card/40 shadow-lg transition-all hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted/30">
                    {producto.imagenPathLocal ? (
                      <img
                        alt={producto.nombre}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        src={convertFileSrc(producto.imagenPathLocal)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/10">
                        <Boxes className="size-24" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex flex-col gap-2">
                       <Badge variant={producto.estado === "ACTIVO" ? "default" : "secondary"} className="shadow-lg font-bold border-none px-3">
                        {producto.estado}
                      </Badge>
                      {producto.stockActual <= producto.stockMinimo && (
                        <Badge variant="destructive" className="animate-pulse shadow-lg font-bold">REPOSICIÓN</Badge>
                      )}
                    </div>
                  </div>

                  <CardHeader className="pb-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">{producto.marca}</p>
                      <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">{producto.nombre}</CardTitle>
                      <CardDescription className="line-clamp-1">{producto.variante || "Principal"}</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4 flex flex-col justify-end">
                    <div className="flex items-center justify-between border-t border-border/50 pt-4">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground/70">Precio venta</p>
                        <p className="text-xl font-black text-foreground">{currencyFormatter.format(producto.precioVenta)}</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground/70">Stock actual</p>
                        <p className={`text-xl font-black ${producto.stockActual <= producto.stockMinimo ? "text-rose-500" : "text-emerald-500"}`}>
                          {producto.stockActual} <span className="text-[10px] font-medium opacity-50">u.</span>
                        </p>
                      </div>
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
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        disabled={isDeleting === producto.inventarioId}
                        className="rounded-xl h-9 col-span-2 text-rose-500 hover:bg-rose-500/10 font-bold"
                        onClick={() => handleDelete(producto)}
                      >
                        {isDeleting === producto.inventarioId ? "Eliminando..." : "Eliminar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {productos.map((producto) => (
                <div 
                  key={producto.inventarioId} 
                  className="group flex flex-col md:flex-row items-center gap-4 p-3 bg-card/40 rounded-2xl border border-border/50 hover:bg-card/60 transition-all hover:shadow-lg hover:border-primary/20"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted/30">
                    {producto.imagenPathLocal ? (
                      <img
                        alt={producto.nombre}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        src={convertFileSrc(producto.imagenPathLocal)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/10">
                        <Boxes className="size-8" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary/60">{producto.marca}</p>
                      <Badge variant={producto.estado === "ACTIVO" ? "default" : "secondary"} className="text-[8px] h-4 px-1.5 font-bold border-none uppercase">
                        {producto.estado}
                      </Badge>
                      {producto.stockActual <= producto.stockMinimo && (
                        <Badge variant="destructive" className="text-[8px] h-4 px-1.5 font-bold animate-pulse">BAJO STOCK</Badge>
                      )}
                    </div>
                    <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{producto.nombre}</h4>
                    <p className="text-xs text-muted-foreground truncate">{producto.variante || "Principal"}</p>
                  </div>

                  <div className="flex flex-row md:flex-col items-center md:items-end gap-1 md:gap-0 px-4 border-x md:border-x-0 md:border-l border-border/50 min-w-32">
                    <p className="text-[9px] font-bold uppercase text-muted-foreground/50 md:hidden">Venta:</p>
                    <p className="font-black text-sm">{currencyFormatter.format(producto.precioVenta)}</p>
                    <p className="text-[9px] font-medium text-muted-foreground hidden md:block uppercase tracking-tighter">Precio de venta</p>
                  </div>

                  <div className="flex flex-row md:flex-col items-center md:items-end gap-1 md:gap-0 px-4 min-w-28">
                    <p className={`font-black text-sm ${producto.stockActual <= producto.stockMinimo ? "text-rose-500" : "text-emerald-500"}`}>
                      {producto.stockActual} <span className="text-[10px] font-medium opacity-50">u.</span>
                    </p>
                    <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-tighter">Stock disponible</p>
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
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-9 w-9 rounded-xl hover:bg-rose-500/10 text-rose-500"
                      disabled={isDeleting === producto.inventarioId}
                      onClick={() => handleDelete(producto)}
                    >
                      <Boxes className="size-4" />
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