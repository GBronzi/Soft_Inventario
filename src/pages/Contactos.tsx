import { Building2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ContactRound, Download, Mail, Pencil, Phone, Save, Search, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createContacto, deleteContacto, getContactos, getContactosPage, updateContacto } from "@/database/queries";
import { exportContactosExcelCsv, exportContactosGoogleCsv, parseContactosCsv } from "@/lib/contactosCsv";
import type { Contacto, ContactoDraft } from "@/types";

const emptyForm: ContactoDraft = {
  nombre: "", apellidos: "", empresa: "", cargo: "", email: "", emailAlternativo: "",
  telefono: "", telefonoAlternativo: "", direccion: "", ciudad: "", provincia: "",
  codigoPostal: "", pais: "", sitioWeb: "", fechaNacimiento: "", notas: "",
};

function toDraft(contacto: Contacto): ContactoDraft {
  return {
    nombre: contacto.nombre, apellidos: contacto.apellidos ?? "", empresa: contacto.empresa ?? "",
    cargo: contacto.cargo ?? "", email: contacto.email ?? "", emailAlternativo: contacto.emailAlternativo ?? "",
    telefono: contacto.telefono ?? "", telefonoAlternativo: contacto.telefonoAlternativo ?? "",
    direccion: contacto.direccion ?? "", ciudad: contacto.ciudad ?? "", provincia: contacto.provincia ?? "",
    codigoPostal: contacto.codigoPostal ?? "", pais: contacto.pais ?? "", sitioWeb: contacto.sitioWeb ?? "",
    fechaNacimiento: contacto.fechaNacimiento ?? "", notas: contacto.notas ?? "",
  };
}

function contactKeys(contacto: {
  email?: string | null;
  emailAlternativo?: string | null;
  telefono?: string | null;
  telefonoAlternativo?: string | null;
}) {
  const emails = [contacto.email, contacto.emailAlternativo]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => `email:${value}`);
  const phones = [contacto.telefono, contacto.telefonoAlternativo]
    .map((value) => value?.replace(/\D/g, ""))
    .filter(Boolean)
    .map((value) => `phone:${value}`);
  return [...emails, ...phones];
}

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Contactos() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ContactoDraft>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  async function loadContactos(term = search, targetPage = page, size = pageSize) {
    setLoading(true);
    try {
      const result = await getContactosPage(term, size, (targetPage - 1) * size);
      const lastPage = Math.max(1, Math.ceil(result.total / size));
      if (targetPage > lastPage) {
        setPage(lastPage);
        return;
      }
      setContactos(result.items);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContactos(search, page, pageSize), 180);
    return () => window.clearTimeout(timer);
  }, [search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setField(field: keyof ContactoDraft, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.nombre.trim()) return;
    if (editingId) await updateContacto(editingId, form);
    else await createContacto(form);
    setMessage(editingId ? "Contacto actualizado." : "Contacto guardado.");
    resetForm();
    await loadContactos();
  }

  function handleEdit(contacto: Contacto) {
    setEditingId(contacto.id);
    setForm(toDraft(contacto));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(contacto: Contacto) {
    if (!window.confirm(`¿Eliminar a ${contacto.nombre} ${contacto.apellidos ?? ""}?`)) return;
    await deleteContacto(contacto.id);
    if (editingId === contacto.id) resetForm();
    setMessage("Contacto eliminado.");
    await loadContactos();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseContactosCsv(await file.text());
    const allContacts = await getContactos();
    const existing = new Set(allContacts.flatMap(contactKeys));
    let imported = 0;
    let duplicated = 0;
    for (const contacto of parsed.contactos) {
      const keys = contactKeys(contacto);
      if (keys.some((key) => existing.has(key))) {
        duplicated += 1;
        continue;
      }
      await createContacto(contacto);
      keys.forEach((key) => existing.add(key));
      imported += 1;
    }
    setMessage(`${imported} contacto(s) importado(s), ${duplicated} duplicado(s) omitido(s)${parsed.errores.length ? `, ${parsed.errores.length} fila(s) con error` : ""}.`);
    setPage(1);
    await loadContactos(search, 1, pageSize);
  }

  async function handleExport(format: "google" | "excel") {
    const allContacts = await getContactos();
    const content = format === "google" ? exportContactosGoogleCsv(allContacts) : exportContactosExcelCsv(allContacts);
    downloadCsv(content, format === "google" ? "contactos-google.csv" : "contactos-excel.csv");
  }

  const input = (label: string, field: keyof ContactoDraft, type = "text") => (
    <label className="space-y-1 text-sm font-semibold">
      <span>{label}</span>
      <Input type={type} value={form[field] ?? ""} onChange={(event) => setField(field, event.target.value)} />
    </label>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight"><ContactRound className="size-6 text-primary" /> Contactos</h1>
          <p className="text-sm text-muted-foreground">Agenda local compatible con CSV de Google Contacts y Excel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
          <Button type="button" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 size-4" /> Importar Google/Excel</Button>
          <Button type="button" variant="outline" disabled={!total} onClick={() => void handleExport("google")}><Download className="mr-2 size-4" /> Exportar a Google</Button>
          <Button type="button" variant="outline" disabled={!total} onClick={() => void handleExport("excel")}><Download className="mr-2 size-4" /> Exportar a Excel</Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium">{message}</div>}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">{editingId ? "Modificar contacto" : "Nuevo contacto"}</CardTitle>
          <CardDescription>El nombre es obligatorio; los demás campos son opcionales.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {input("Nombre", "nombre")}{input("Apellidos", "apellidos")}{input("Empresa", "empresa")}{input("Cargo", "cargo")}
              {input("Email", "email", "email")}{input("Email alternativo", "emailAlternativo", "email")}{input("Teléfono", "telefono", "tel")}{input("Teléfono alternativo", "telefonoAlternativo", "tel")}
              {input("Dirección", "direccion")}{input("Ciudad", "ciudad")}{input("Provincia", "provincia")}{input("Código postal", "codigoPostal")}
              {input("País", "pais")}{input("Sitio web", "sitioWeb", "url")}{input("Fecha de nacimiento", "fechaNacimiento", "date")}
            </div>
            <label className="block space-y-1 text-sm font-semibold"><span>Notas</span><Textarea value={form.notas ?? ""} onChange={(event) => setField("notas", event.target.value)} /></label>
            <div className="flex justify-end gap-2">
              {editingId && <Button type="button" variant="outline" onClick={resetForm}><X className="mr-2 size-4" /> Cancelar</Button>}
              <Button type="submit" disabled={!form.nombre.trim()}><Save className="mr-2 size-4" /> {editingId ? "Guardar cambios" : "Guardar contacto"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div><CardTitle className="text-lg">Agenda</CardTitle><CardDescription>{total} contacto(s) encontrado(s)</CardDescription></div>
          <label className="relative block w-full md:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar contacto" aria-label="Buscar contacto" className="pl-9" /></label>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader><TableRow><TableHead>Contacto</TableHead><TableHead>Empresa</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead><TableHead className="w-[104px] text-right">Acciones</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">Cargando contactos...</TableCell></TableRow> : contactos.length === 0 ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No hay contactos para mostrar.</TableCell></TableRow> : contactos.map((contacto) => (
                  <TableRow key={contacto.id}>
                    <TableCell><p className="font-semibold">{contacto.nombre} {contacto.apellidos}</p>{contacto.cargo && <p className="text-xs text-muted-foreground">{contacto.cargo}</p>}</TableCell>
                    <TableCell>{contacto.empresa ? <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" />{contacto.empresa}</span> : "-"}</TableCell>
                    <TableCell>{contacto.email ? <a href={`mailto:${contacto.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="size-3.5 text-muted-foreground" />{contacto.email}</a> : "-"}</TableCell>
                    <TableCell>{contacto.telefono ? <a href={`tel:${contacto.telefono}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="size-3.5 text-muted-foreground" />{contacto.telefono}</a> : "-"}</TableCell>
                    <TableCell><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => handleEdit(contacto)} aria-label={`Modificar ${contacto.nombre}`} title="Modificar"><Pencil className="size-4" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(contacto)} aria-label={`Eliminar ${contacto.nombre}`} title="Eliminar" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Filas por página
              <select
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </label>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="min-w-32 text-center text-sm text-muted-foreground">Página {page} de {totalPages}</span>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="icon" onClick={() => setPage(1)} disabled={page <= 1 || loading} aria-label="Primera página" title="Primera página"><ChevronsLeft className="size-4" /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Página anterior" title="Página anterior"><ChevronLeft className="size-4" /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} aria-label="Página siguiente" title="Página siguiente"><ChevronRight className="size-4" /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading} aria-label="Última página" title="Última página"><ChevronsRight className="size-4" /></Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
