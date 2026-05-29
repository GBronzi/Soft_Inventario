import { open } from "@tauri-apps/plugin-dialog";
import { X, Image as ImageIcon, Plus, Save, ArrowLeft, Package, Info, DollarSign, Calendar, MapPin } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProducto, getProductoByInventarioId, updateProducto, getUniqueVariantes, getUniqueCapacidades, getUniqueMarcas } from "@/database/queries";
import type { EstadoInventario } from "@/types";

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

export function ProductoForm() {
  const navigate = useNavigate();
  const params = useParams();
  const isEditing = Boolean(params.inventarioId);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [stockActual, setStockActual] = useState<number | null>(null);
  
  const [variantesOptions, setVariantesOptions] = useState<string[]>([]);
  const [capacidadesOptions, setCapacidadesOptions] = useState<string[]>([]);
  const [marcasOptions, setMarcasOptions] = useState<string[]>([]);

  const [isNewMarca, setIsNewMarca] = useState(false);
  const [isNewVariante, setIsNewVariante] = useState(false);
  const [isNewCapacidad, setIsNewCapacidad] = useState(false);

  useEffect(() => {
    async function fetchOptions() {
      try {
        const [vOpts, cOpts, mOpts] = await Promise.all([getUniqueVariantes(), getUniqueCapacidades(), getUniqueMarcas()]);
        const defaultVariantes = ["Sellado", "Abierto", "Tester", "Muestra"];
        setVariantesOptions(Array.from(new Set([...defaultVariantes, ...vOpts])));
        setCapacidadesOptions(cOpts);
        setMarcasOptions(mOpts);
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
        }
      } catch (error) {
        setStatus("Error al cargar producto");
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
        setStatus("Cambios guardados correctamente.");
      } else {
        await createProducto(payload as any);
        setForm(initialForm);
        setStatus("Producto registrado con éxito.");
      }
    } catch (error: any) {
      const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      setStatus(`Error: ${msg}`);
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
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-primary text-primary-foreground">
             <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="font-bold flex items-center gap-2 text-lg"><Save className="size-5" /> Acción Final</h3>
                  <p className="text-xs opacity-80">Asegúrate de revisar el stock inicial antes de guardar.</p>
                </div>
                {status && <p className="text-xs font-bold bg-white/10 p-2 rounded-lg">{status}</p>}
                <Button disabled={saving} type="submit" className="w-full h-12 rounded-2xl bg-white text-primary hover:bg-white/90 font-black shadow-2xl">
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
                <select className={selectClassName} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  <option value="">Seleccione...</option>
                  <option value="Hombre">Hombre</option>
                  <option value="Mujer">Mujer</option>
                  <option value="Unisex">Unisex</option>
                  <option value="Infantil">Infantil</option>
                </select>
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
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Tipo / Variante</label>
                {!isNewVariante ? (
                  <select className={selectClassName} value={variantesOptions.includes(form.variante) ? form.variante : (form.variante ? "__NEW_INIT__" : "")} onChange={(e) => {
                    if (e.target.value === "__NEW__") { setIsNewVariante(true); setForm({ ...form, variante: "" }); }
                    else if (e.target.value === "__NEW_INIT__") { setIsNewVariante(true); }
                    else setForm({ ...form, variante: e.target.value });
                  }}>
                    <option value="">Seleccione...</option>
                    {variantesOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    {form.variante && !variantesOptions.includes(form.variante) && <option value="__NEW_INIT__">{form.variante}</option>}
                    <option value="__NEW__" className="font-bold text-primary">+ Nueva Presentación...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input autoFocus className="rounded-xl" placeholder="Ej: Tester" value={form.variante} onChange={(e) => setForm({ ...form, variante: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => { setIsNewVariante(false); setForm({...form, variante: ""}); }}><X className="size-4" /></Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Capacidad</label>
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
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}