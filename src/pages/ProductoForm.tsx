import { open } from "@tauri-apps/plugin-dialog";
import { X, Image as ImageIcon, Plus, Save, ArrowLeft, Package, Info, DollarSign, Calendar, MapPin, CheckCircle2, AlertCircle, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProducto, getProductoByInventarioId, updateProducto, getUniqueCapacidades, getUniqueMarcas, getProductoCategorias, getCategoriasArbol } from "@/database/queries";
import { buildTiendanubeSyncFeedbackMessage, pushInventarioIdATiendanube } from "@/api/tiendanube";
import type { CategoriaRef, CategoriaTreeNode, EstadoInventario } from "@/types";
import { flattenCategoriaTreeOptions } from "@/lib/utils";

const initialForm = {
  nombre: "",
  categoria: "",
  marca: "",
  variante: "",
  capacidadMedida: "",
  sku: "",
  codigoBarras: "",
  imagenPathLocal: "",
  descripcion: "",
  notas: "",
  seoTitulo: "",
  seoDescripcion: "",
  tags: "",
  publicado: true,
  precioCompra: "0",
  precioVenta: "0",
  stockInicial: "0",
  stockMinimo: "0",
  ubicacion: "",
  lote: "",
  vencimiento: "",
  fechaIngreso: "",
  estado: "ACTIVO" as EstadoInventario,
};

const selectClassName =
  "h-10 w-full rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20 appearance-none";

type StatusTone = "success" | "error" | "info";

type StatusState = {
  tone: StatusTone;
  message: string;
} | null;

export function ProductoForm() {
  const navigate = useNavigate();
  const params = useParams();
  const isEditing = Boolean(params.inventarioId);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<StatusState>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [stockActual, setStockActual] = useState<number | null>(null);
  const [tnCategorias, setTnCategorias] = useState<CategoriaRef[]>([]);
  const [categoriaOptions, setCategoriaOptions] = useState<CategoriaTreeNode[]>([]);
  
  const [capacidadesOptions, setCapacidadesOptions] = useState<string[]>([]);
  const [marcasOptions, setMarcasOptions] = useState<string[]>([]);

  const [isNewMarca, setIsNewMarca] = useState(false);
  const [isNewCapacidad, setIsNewCapacidad] = useState(false);

  useEffect(() => {
    async function fetchOptions() {
      try {
        const [cOpts, mOpts, categoriasArbol] = await Promise.all([getUniqueCapacidades(), getUniqueMarcas(), getCategoriasArbol()]);
        setCapacidadesOptions(cOpts);
        setMarcasOptions(mOpts);
        setCategoriaOptions(categoriasArbol);
      } catch (err) {
        console.error("Error fetching options:", err);
      }
    }
    void fetchOptions();
  }, []);

  useEffect(() => {
    async function loadProducto() {
      if (!params.inventarioId) {
        setLoading(false);
        return;
      }
      const inventarioId = Number(params.inventarioId);
      try {
        const detalle = await getProductoByInventarioId(inventarioId);
        if (detalle) {
          setForm({
            nombre: detalle.nombre,
            categoria: detalle.categoria ?? "",
            marca: detalle.marca ?? "",
            variante: detalle.variante ?? "",
            capacidadMedida: detalle.capacidadMedida ?? "",
            sku: detalle.sku ?? "",
            codigoBarras: detalle.codigoBarras ?? "",
            imagenPathLocal: detalle.imagenPathLocal ?? "",
            descripcion: detalle.descripcion ?? "",
            notas: detalle.notas ?? "",
            seoTitulo: detalle.seoTitulo ?? "",
            seoDescripcion: detalle.seoDescripcion ?? "",
            tags: detalle.tags ?? "",
            publicado: detalle.publicado !== 0,
            precioCompra: String(detalle.precioCompra ?? 0),
            precioVenta: String(detalle.precioVenta ?? 0),
            stockInicial: String(detalle.stockActual ?? 0),
            stockMinimo: String(detalle.stockMinimo ?? 0),
            ubicacion: detalle.ubicacion ?? "",
            lote: detalle.lote ?? "",
            vencimiento: detalle.vencimiento?.slice(0, 10) ?? "",
            fechaIngreso: "",
            estado: detalle.estado,
          });
          setStockActual(detalle.stockActual ?? 0);
          try {
            setTnCategorias(await getProductoCategorias(detalle.productoId));
          } catch {
            setTnCategorias([]);
          }
        }
      } catch (error) {
        setStatus({ tone: "error", message: "Error al cargar producto" });
      } finally {
        setLoading(false);
      }
    }
    void loadProducto();
  }, [params.inventarioId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        ...form,
        precioCompra: parseFloat(String(form.precioCompra).replace(",", ".")) || 0,
        precioVenta: parseFloat(String(form.precioVenta).replace(",", ".")) || 0,
        stockInicial: parseInt(String(form.stockInicial), 10) || 0,
        stockMinimo: parseInt(String(form.stockMinimo), 10) || 0,
      };

      if (isEditing && params.inventarioId) {
        await updateProducto(Number(params.inventarioId), payload as any);
        setStatus({ tone: "success", message: "Cambios guardados correctamente." });
        try {
          const syncResult = await pushInventarioIdATiendanube(Number(params.inventarioId));
          setStatus({ tone: "success", message: buildTiendanubeSyncFeedbackMessage({ isEditing, categoryAssigned: syncResult.categoryAssigned }) });
        } catch (syncErr) {
          console.warn("No se pudo sincronizar con Tiendanube:", syncErr);
          setStatus({ tone: "info", message: "Los cambios se guardaron localmente. La sincronización con Tiendanube se reintentará más tarde." });
        }
      } else {
        const inventarioId = await createProducto(payload as any);
        setForm(initialForm);
        setStatus({ tone: "success", message: "Producto registrado con éxito." });
        try {
          const syncResult = await pushInventarioIdATiendanube(inventarioId);
          setStatus({ tone: "success", message: buildTiendanubeSyncFeedbackMessage({ isEditing, categoryAssigned: syncResult.categoryAssigned }) });
        } catch (syncErr) {
          console.warn("No se pudo sincronizar el producto nuevo con Tiendanube:", syncErr);
          setStatus({ tone: "error", message: "Producto creado localmente. La sincronización con Tiendanube falló (se reintentará)." });
        }
      }
    } catch (error: any) {
      const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      setStatus({ tone: "error", message: `Error: ${msg}` });
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectImage() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (typeof selected === 'string') setForm(prev => ({ ...prev, imagenPathLocal: selected }));
  }

  if (loading) return <div className="p-20 text-center animate-pulse">Cargando formulario...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full bg-card" onClick={() => navigate("/catalogo")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{isEditing ? "Editar Variante" : "Nuevo Producto"}</h1>
            <p className="text-sm text-muted-foreground">{isEditing ? `Modificando ${form.nombre}` : "Registra un nuevo perfume en tu catálogo local"}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-12">
        {/* Columna Izquierda: Imagen y Estado */}
        <div className="md:col-span-4 space-y-6">
          <Card className="overflow-hidden border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader className="pb-0">
               <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest opacity-60"><ImageIcon className="size-4" /> Imagen</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="group relative aspect-square w-full overflow-hidden rounded-3xl bg-muted/30 border-2 border-dashed border-border/50 flex items-center justify-center transition-all hover:bg-muted/50">
                {form.imagenPathLocal ? (
                  <>
                    <img src={convertFileSrc(form.imagenPathLocal)} alt="Preview" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 rounded-full size-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setForm({...form, imagenPathLocal: ""})}>
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                    <Plus className="size-10" />
                    <span className="text-xs font-bold uppercase tracking-tighter">Sin imagen</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                   <Button type="button" variant="secondary" className="rounded-xl font-bold" onClick={handleSelectImage}>Cambiar Foto</Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Estado de disponibilidad</label>
                <select className={selectClassName} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoInventario })}>
                  <option value="ACTIVO">Activo (Venta)</option>
                  <option value="PAUSADO">Pausado (No venta)</option>
                  <option value="DISCONTINUADO">Discontinuado</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Visibilidad en Tiendanube</label>
                <label className="flex items-center gap-3 cursor-pointer select-none rounded-xl border border-border/50 bg-background/50 px-3 h-10">
                  <input type="checkbox" checked={form.publicado} onChange={(e) => setForm({ ...form, publicado: e.target.checked })} className="size-4 accent-primary" />
                  <span className="text-sm font-bold">{form.publicado ? "Visible (publicado)" : "Oculto"}</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
             <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="font-bold flex items-center gap-2 text-lg"><Save className="size-5" /> Acción Final</h3>
                  <p className="text-xs opacity-80">Asegúrate de revisar el stock inicial antes de guardar.</p>
                </div>
                {status && (
                  <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm font-medium ${status.tone === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" : status.tone === "error" ? "border-red-500/30 bg-red-500/15 text-red-800 dark:bg-red-500/20 dark:text-red-200" : "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200"}`}>
                    {status.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : status.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />}
                    <span>{status.message}</span>
                  </div>
                )}
                <Button disabled={saving} type="submit" className="w-full h-12 rounded-2xl bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 font-black shadow-2xl">
                  {saving ? "Guardando..." : isEditing ? "Actualizar Datos" : "Registrar Producto"}
                </Button>
             </CardContent>
          </Card>
        </div>

        {/* Columna Derecha: Datos */}
        <div className="md:col-span-8 space-y-6">
          {/* Bloque 1: Identidad */}
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest opacity-60"><Info className="size-4" /> Identidad Comercial</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Nombre del Perfume *</label>
                <Input required className="rounded-xl h-12 bg-background/50" placeholder="Ej: Sauvage Elixir" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Marca</label>
                {!isNewMarca ? (
                  <div className="relative">
                    <select className={selectClassName} value={marcasOptions.includes(form.marca) ? form.marca : (form.marca ? "__NEW_INIT__" : "")} onChange={(e) => {
                      if (e.target.value === "__NEW__") { setIsNewMarca(true); setForm({ ...form, marca: "" }); }
                      else if (e.target.value === "__NEW_INIT__") { setIsNewMarca(true); }
                      else setForm({ ...form, marca: e.target.value });
                    }}>
                      <option value="">Seleccione marca...</option>
                      {marcasOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      {form.marca && !marcasOptions.includes(form.marca) && <option value="__NEW_INIT__">{form.marca}</option>}
                      <option value="__NEW__" className="font-bold text-primary">+ Nueva Marca...</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input autoFocus className="rounded-xl" placeholder="Marca nueva..." value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => { setIsNewMarca(false); setForm({...form, marca: ""}); }}><X className="size-4" /></Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Categoría</label>
                <select
                  className={selectClassName}
                  value={(() => {
                    const options = flattenCategoriaTreeOptions(categoriaOptions);
                    const exactMatch = options.find((option) => option.value === form.categoria);
                    if (exactMatch) return exactMatch.value;
                    const legacyMatch = options.find((option) => option.path[option.path.length - 1]?.toLowerCase() === form.categoria?.toLowerCase());
                    return legacyMatch?.value ?? "";
                  })()}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                >
                  <option value="">Seleccione...</option>
                  {flattenCategoriaTreeOptions(categoriaOptions).map((option) => (
                    <option key={option.id} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">Se usa la misma jerarquía que Tiendanube cuando está disponible.</p>
                {tnCategorias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground/60 w-full">Categorías de Tiendanube (solo lectura)</span>
                    {tnCategorias.map((c) => (
                      <span key={c.id} className="rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5">{c.nombre}</span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bloque 2: Presentación */}
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest opacity-60"><Package className="size-4" /> Presentación y Códigos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Tipo</label>
                <select className={selectClassName} value={form.variante} onChange={(e) => setForm({ ...form, variante: e.target.value })}>
                  <option value="">Seleccione...</option>
                  <option value="Sellado">Sellado</option>
                  <option value="Abierto">Abierto</option>
                  <option value="Tester">Tester</option>
                  <option value="Muestra">Muestra</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Variante</label>
                {!isNewCapacidad ? (
                  <select className={selectClassName} value={capacidadesOptions.includes(form.capacidadMedida) ? form.capacidadMedida : (form.capacidadMedida ? "__NEW_INIT__" : "")} onChange={(e) => {
                    if (e.target.value === "__NEW__") { setIsNewCapacidad(true); setForm({ ...form, capacidadMedida: "" }); }
                    else if (e.target.value === "__NEW_INIT__") { setIsNewCapacidad(true); }
                    else setForm({ ...form, capacidadMedida: e.target.value });
                  }}>
                    <option value="">Seleccione...</option>
                    {capacidadesOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    {form.capacidadMedida && !capacidadesOptions.includes(form.capacidadMedida) && <option value="__NEW_INIT__">{form.capacidadMedida}</option>}
                    <option value="__NEW__" className="font-bold text-primary">+ Nueva Capacidad...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input autoFocus className="rounded-xl" placeholder="Ej: 100ml" value={form.capacidadMedida} onChange={(e) => setForm({ ...form, capacidadMedida: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => { setIsNewCapacidad(false); setForm({...form, capacidadMedida: ""}); }}><X className="size-4" /></Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">SKU (Interno)</label>
                <Input className="rounded-xl bg-background/50" placeholder="Ej: PERF-001" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Código de Barras</label>
                <Input className="rounded-xl bg-background/50" placeholder="Escanear..." value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          {/* Bloque 3: Valores y Stock */}
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest opacity-60"><DollarSign className="size-4" /> Precios y Existencias</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Costo de Compra</label>
                <Input type="number" step="0.01" className="rounded-xl h-11 bg-blue-500/5 border-blue-500/20" value={form.precioCompra} onChange={(e) => setForm({ ...form, precioCompra: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Precio de Venta</label>
                <Input type="number" step="0.01" className="rounded-xl h-11 bg-emerald-500/5 border-emerald-500/20 font-bold text-emerald-600" value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Stock Inicial</label>
                <Input type="number" disabled={isEditing} className={`rounded-xl h-11 ${isEditing ? "bg-muted" : "bg-orange-500/5 border-orange-500/20"}`} value={isEditing ? String(stockActual) : form.stockInicial} onChange={(e) => setForm({ ...form, stockInicial: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Mínimo de Alerta</label>
                <Input type="number" className="rounded-xl h-11 bg-rose-500/5 border-rose-500/20" value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          {/* Bloque 4: Logística */}
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 uppercase tracking-widest opacity-60"><Calendar className="size-4" /> Logística y Notas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
               <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Lote</label>
                <Input className="rounded-xl bg-background/50" placeholder="Identificador de lote" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Vencimiento</label>
                <Input type="date" className="rounded-xl bg-background/50 uppercase text-xs" value={form.vencimiento} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} />
              </div>
              {!isEditing && (
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Fecha de Ingreso al Local</label>
                  <Input type="date" className="rounded-xl bg-background/50 uppercase text-xs" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} />
                </div>
              )}
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1 flex items-center gap-1"><MapPin className="size-3" /> Ubicación en Depósito</label>
                <Input className="rounded-xl bg-background/50" placeholder="Ej: Estante B1 - Fila 3" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Descripción y Notas Internas</label>
                <Textarea className="rounded-xl bg-background/50 min-h-[100px]" placeholder="Detalles extra sobre el perfume..." value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Título SEO</label>
                <Input className="rounded-xl bg-background/50" placeholder="Título para buscadores" value={form.seoTitulo} onChange={(e) => setForm({ ...form, seoTitulo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Tags (separados por coma)</label>
                <Input className="rounded-xl bg-background/50" placeholder="perfume, árabe, masculino" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Descripción SEO</label>
                <Textarea className="rounded-xl bg-background/50 min-h-[70px]" placeholder="Descripción breve para buscadores..." value={form.seoDescripcion} onChange={(e) => setForm({ ...form, seoDescripcion: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}