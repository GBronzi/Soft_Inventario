import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Edit3,
  PlusCircle,
  MinusCircle,
  Zap,
  Activity,
  Package,
  Tag,
  Calendar,
  Hash,
  MapPin,
  FileText,
  Boxes,
  RefreshCw,
  Barcode,
  Layers,
  Eye,
  EyeOff,
  Globe,
  ShoppingBag
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMovimientosByInventarioId, getProductoByInventarioId, getProductoCategorias } from "@/database/queries";
import { buildMovimientosRoute, buildRepeatMovimientoRoute, buildVentaRapidaRoute } from "@/lib/movimientos";
import type { CategoriaRef, MovimientoListado, ProductoDetalle as ProductoDetalleType } from "@/types";

const KARDEX_PAGE_SIZE = 15;
const KARDEX_QUERY_LIMIT = KARDEX_PAGE_SIZE + 1;

export function ProductoDetalle() {
  const navigate = useNavigate();
  const params = useParams();
  const [detalle, setDetalle] = useState<ProductoDetalleType | null>(null);
  const [categorias, setCategorias] = useState<CategoriaRef[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoListado[]>([]);
  const [kardexHasMore, setKardexHasMore] = useState(false);
  const [kardexPage, setKardexPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const inventarioId = Number(params.inventarioId);

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  });

  useEffect(() => {
    async function load() {
      if (!inventarioId) return;
      setLoading(true);
      try {
        const [prod, movs] = await Promise.all([
          getProductoByInventarioId(inventarioId),
          getMovimientosByInventarioId(inventarioId, KARDEX_QUERY_LIMIT, 0),
        ]);
        if (prod) {
          setDetalle(prod);
          setKardexHasMore(movs.length > KARDEX_PAGE_SIZE);
          setMovimientos(movs.slice(0, KARDEX_PAGE_SIZE));
          try {
            setCategorias(await getProductoCategorias(prod.productoId));
          } catch {
            setCategorias([]);
          }
        } else {
          setStatus("Variante no encontrada");
        }
      } catch (err) {
        setStatus("Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [inventarioId]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await getMovimientosByInventarioId(inventarioId, KARDEX_QUERY_LIMIT, kardexPage * KARDEX_PAGE_SIZE);
      setKardexHasMore(next.length > KARDEX_PAGE_SIZE);
      setMovimientos(prev => [...prev, ...next.slice(0, KARDEX_PAGE_SIZE)]);
      setKardexPage(p => p + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-muted-foreground uppercase tracking-widest font-black">Cargando Ficha Técnica...</div>;

  if (!detalle) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <p className="text-rose-500 font-bold">{status || "Producto no encontrado"}</p>
        <Button onClick={() => navigate("/catalogo")} variant="outline">Volver al Catálogo</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Header con navegación */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="rounded-xl gap-2 hover:bg-card" onClick={() => navigate("/catalogo")}>
          <ArrowLeft className="size-4" /> Volver al catálogo
        </Button>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => navigate(`/producto/${detalle.inventarioId}/editar`)}>
            <Edit3 className="size-4" /> Editar Ficha
          </Button>
          <Button size="sm" className="rounded-xl gap-2 bg-primary shadow-lg shadow-primary/20" onClick={() => navigate(buildVentaRapidaRoute(detalle.inventarioId))}>
            <Zap className="size-4" /> Venta Rápida
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LADO IZQUIERDO: IMAGEN Y DATOS CORE */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="border-none shadow-2xl bg-card/60 backdrop-blur-md overflow-hidden rounded-[2.5rem]">
              <div className="aspect-square relative bg-muted/20">
                {detalle.imagenPathLocal ? (
                  <img src={convertFileSrc(detalle.imagenPathLocal)} alt={detalle.nombre} className="h-full w-full object-cover" />
                ) : detalle.imagenUrl ? (
                  <img src={detalle.imagenUrl} alt={detalle.nombre} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center opacity-10"><Boxes className="size-32" /></div>
                )}
                <div className="absolute top-6 right-6">
                   <Badge variant={detalle.estado === 'ACTIVO' ? 'default' : 'secondary'} className="px-4 py-1.5 shadow-xl font-bold border-none bg-background/80 backdrop-blur-md text-foreground">
                    {detalle.estado}
                   </Badge>
                </div>
              </div>
              <CardContent className="p-8 space-y-6">
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60 mb-1">{detalle.marca}</p>
                    <h1 className="text-3xl font-black tracking-tight leading-tight">{detalle.nombre}</h1>
                    <p className="text-muted-foreground font-medium mt-1">{detalle.variante || "Presentación Base"}</p>
                 </div>

                 <div className="flex items-center justify-between p-5 rounded-3xl bg-primary/5 border border-primary/10">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Precio de Venta</p>
                        <p className="text-2xl font-black text-primary">{currencyFormatter.format(detalle.precioVenta)}</p>
                    </div>
                    <div className="text-right space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Costo</p>
                        <p className="text-lg font-bold opacity-60">{currencyFormatter.format(detalle.precioCompra)}</p>
                    </div>
                 </div>

                 <div className={`p-5 rounded-3xl border ${detalle.stockActual <= detalle.stockMinimo ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Inventario Actual</p>
                        {detalle.stockActual <= detalle.stockMinimo && (
                            <Badge variant="destructive" className="animate-pulse">REPOSICIÓN CRÍTICA</Badge>
                        )}
                    </div>
                    <div className="flex items-end gap-2">
                        <span className={`text-4xl font-black ${detalle.stockActual <= detalle.stockMinimo ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {detalle.stockActual}
                        </span>
                        <span className="text-xs font-bold opacity-40 mb-2 uppercase tracking-widest">Unidades en stock</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">Mínimo operativo configurado: <span className="font-bold">{detalle.stockMinimo} u.</span></p>
                 </div>
              </CardContent>
           </Card>

           <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" className="rounded-2xl h-12 font-bold gap-2" onClick={() => navigate(buildMovimientosRoute({ inventarioId: detalle.inventarioId, presetTipoMovimiento: "ENTRADA" }))}>
                <PlusCircle className="size-4" /> Entrada
              </Button>
              <Button variant="outline" className="rounded-2xl h-12 font-bold gap-2" onClick={() => navigate(buildMovimientosRoute({ inventarioId: detalle.inventarioId, presetTipoMovimiento: "SALIDA" }))}>
                <MinusCircle className="size-4" /> Salida
              </Button>
           </div>
        </div>

        {/* LADO DERECHO: DETALLES TECNICOS Y KARDEX */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-none shadow-xl bg-card/40 backdrop-blur-md">
            <CardHeader className="pb-2">
               <CardTitle className="text-sm font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                  <Tag className="size-4" /> Especificaciones Técnicas
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Hash className="size-3" /> SKU</p>
                      <p className="font-bold text-sm">{detalle.sku || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Barcode className="size-3" /> Código de Barras</p>
                      <p className="font-bold text-sm break-all">{detalle.codigoBarras || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Package className="size-3" /> Capacidad</p>
                      <p className="font-bold text-sm">{detalle.capacidadMedida || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Tag className="size-3" /> Tipo / Variante</p>
                      <p className="font-bold text-sm">{detalle.variante || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Layers className="size-3" /> Categoría</p>
                      <p className="font-bold text-sm">{detalle.categoria || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><MapPin className="size-3" /> Ubicación</p>
                      <p className="font-bold text-sm">{detalle.ubicacion || "Sin ubicación"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Package className="size-3" /> Lote</p>
                      <p className="font-bold text-sm">{detalle.lote || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Calendar className="size-3" /> Vencimiento</p>
                      <p className="font-bold text-sm">{detalle.vencimiento ? new Date(detalle.vencimiento).toLocaleDateString() : "No definido"}</p>
                  </div>
               </div>

               <div className="mt-8 space-y-4">
                  <div className="space-y-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><FileText className="size-3" /> Descripción Comercial</p>
                     <p className="text-sm text-foreground/80 leading-relaxed italic">{detalle.descripcion || "Sin descripción registrada para esta presentación."}</p>
                  </div>
                  {detalle.notas && (
                    <div className="space-y-1 p-4 rounded-2xl bg-muted/20 border border-border/50">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Notas Internas</p>
                        <p className="text-xs">{detalle.notas}</p>
                    </div>
                  )}
               </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/40 backdrop-blur-md">
            <CardHeader className="pb-2">
               <CardTitle className="text-sm font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                  <ShoppingBag className="size-4" /> E-commerce / Tiendanube
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
               <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        {detalle.publicado ? <Eye className="size-3" /> : <EyeOff className="size-3" />} Visibilidad
                      </p>
                      <Badge variant={detalle.publicado ? "default" : "secondary"} className="border-none">
                        {detalle.publicado ? "Visible (publicado)" : "Oculto"}
                      </Badge>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Hash className="size-3" /> Vínculo Tiendanube</p>
                      <p className="font-bold text-sm">{detalle.tnProductId ? `Producto #${detalle.tnProductId}` : "No vinculado"}</p>
                      {detalle.tnVariantId && <p className="text-[10px] text-muted-foreground">Variante #{detalle.tnVariantId}</p>}
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Tag className="size-3" /> Tags</p>
                      <p className="font-bold text-sm">{detalle.tags || "Sin tags"}</p>
                  </div>
               </div>

               <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Layers className="size-3" /> Categorías de Tiendanube</p>
                  {categorias.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {categorias.map((c) => (
                        <span key={c.id} className="rounded-full bg-primary/10 text-primary text-[11px] font-bold px-3 py-1">{c.nombre}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Sin categorías sincronizadas.</p>
                  )}
               </div>

               <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Globe className="size-3" /> Título SEO</p>
                     <p className="text-sm text-foreground/80">{detalle.seoTitulo || "No definido"}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><FileText className="size-3" /> Descripción SEO</p>
                     <p className="text-sm text-foreground/80">{detalle.seoDescripcion || "No definida"}</p>
                  </div>
               </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-sm font-black uppercase tracking-widest opacity-40 flex items-center gap-2">
                  <Activity className="size-4" /> Historial de Movimientos (Kardex)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="pl-6 text-[10px] font-bold uppercase tracking-tighter">Tipo</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-tighter">Cant.</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-tighter">Stock Final</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-tighter">Motivo / Ref.</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-tighter">Fecha</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">No hay movimientos registrados</TableCell>
                      </TableRow>
                    ) : (
                      movimientos.map(m => (
                        <TableRow key={m.id} className="border-border/30 hover:bg-primary/5 transition-colors group">
                           <TableCell className="pl-6">
                              <Badge variant={m.tipoMovimiento === 'ENTRADA' ? 'secondary' : m.tipoMovimiento === 'SALIDA' ? 'destructive' : 'outline'} className="text-[9px] h-5 border-none">
                                {m.tipoMovimiento}
                              </Badge>
                           </TableCell>
                           <TableCell className={`font-black text-sm ${m.tipoMovimiento === 'ENTRADA' ? 'text-emerald-500' : m.tipoMovimiento === 'SALIDA' ? 'text-rose-500' : 'text-primary'}`}>
                              {m.tipoMovimiento === 'ENTRADA' ? '+' : m.tipoMovimiento === 'SALIDA' ? '-' : ''}{m.cantidad}
                           </TableCell>
                           <TableCell className="font-medium">{m.stockResultante}</TableCell>
                           <TableCell>
                              <div className="max-w-[150px]">
                                <p className="text-xs font-bold line-clamp-1">{m.motivo || "-"}</p>
                                <p className="text-[9px] opacity-40 truncate uppercase">{m.referencia || "S/Ref"}</p>
                              </div>
                           </TableCell>
                           <TableCell className="whitespace-nowrap">
                              <p className="text-[10px] font-bold opacity-60">{new Date(m.fechaMovimiento).toLocaleDateString()}</p>
                              <p className="text-[9px] opacity-40">{new Date(m.fechaMovimiento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                           </TableCell>
                           <TableCell className="pr-4 text-right">
                              <Button aria-label="Repetir" variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => navigate(buildRepeatMovimientoRoute(m))}>
                                 <RefreshCw className="size-3" />
                              </Button>
                           </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
               </Table>

               {kardexHasMore && (
                  <div className="p-4 flex justify-center border-t border-border/30 bg-muted/5">
                    <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest" disabled={loadingMore} onClick={handleLoadMore}>
                      {loadingMore ? "Cargando..." : "Cargar más movimientos"}
                    </Button>
                  </div>
               )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
