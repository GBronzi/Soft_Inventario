import Papa from "papaparse";
import type { Contacto, ContactoDraft } from "@/types";

export interface ContactosCsvResult {
  contactos: ContactoDraft[];
  errores: string[];
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const text = (value: unknown) => value == null ? "" : String(value).trim();

function read(row: Record<string, unknown>, aliases: string[]) {
  const values = new Map(Object.entries(row).map(([key, value]) => [normalize(key), text(value)]));
  for (const alias of aliases) {
    const value = values.get(normalize(alias));
    if (value) return value;
  }
  return "";
}

function multiple(...values: string[]) {
  return values.flatMap((value) => value.split(/\s*:::\s*/)).map((value) => value.trim()).filter(Boolean);
}

export function parseContactosCsv(csv: string): ContactosCsvResult {
  const parsed = Papa.parse<Record<string, unknown>>(csv.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const errores = parsed.errors.map((error) => `Fila ${error.row != null ? error.row + 2 : "desconocida"}: ${error.message}`);
  const contactos: ContactoDraft[] = [];

  parsed.data.forEach((row, index) => {
    const nombre = [read(row, ["Given Name", "First Name", "Nombre"]), read(row, ["Additional Name", "Middle Name", "Segundo nombre"])].filter(Boolean).join(" ") || read(row, ["Name", "Nombre completo"]);
    const emails = multiple(read(row, ["E-mail 1 - Value", "Email 1", "Email", "Correo"]), read(row, ["E-mail 2 - Value", "Email 2", "Email alternativo", "Correo alternativo"]));
    const telefonos = multiple(read(row, ["Phone 1 - Value", "Telefono 1", "Teléfono", "Telefono", "Móvil", "Movil"]), read(row, ["Phone 2 - Value", "Telefono 2", "Teléfono alternativo", "Telefono alternativo"]));
    if (!nombre) {
      errores.push(`Fila ${index + 2}: falta el nombre del contacto.`);
      return;
    }
    contactos.push({
      nombre,
      apellidos: read(row, ["Family Name", "Last Name", "Apellidos", "Apellido"]),
      empresa: read(row, ["Organization 1 - Name", "Organization Name", "Empresa", "Organización", "Organizacion"]),
      cargo: read(row, ["Organization 1 - Title", "Organization Title", "Cargo", "Puesto"]),
      email: emails[0] ?? "",
      emailAlternativo: emails[1] ?? "",
      telefono: telefonos[0] ?? "",
      telefonoAlternativo: telefonos[1] ?? "",
      direccion: read(row, ["Address 1 - Street", "Address 1 - Formatted", "Dirección", "Direccion"]),
      ciudad: read(row, ["Address 1 - City", "Ciudad"]),
      provincia: read(row, ["Address 1 - Region", "Provincia", "Región", "Region", "Estado"]),
      codigoPostal: read(row, ["Address 1 - Postal Code", "Código postal", "Codigo postal", "CP"]),
      pais: read(row, ["Address 1 - Country", "País", "Pais"]),
      sitioWeb: read(row, ["Website 1 - Value", "Sitio web", "Website", "Web"]),
      fechaNacimiento: read(row, ["Birthday", "Fecha de nacimiento", "Nacimiento"]),
      notas: read(row, ["Notes", "Notas", "Observaciones"]),
    });
  });
  return { contactos, errores };
}

function csv(rows: Record<string, string>[]) {
  return `\uFEFF${Papa.unparse(rows, { quotes: true, newline: "\r\n", escapeFormulae: true })}`;
}

export function exportContactosGoogleCsv(contactos: Contacto[]) {
  return csv(contactos.map((c) => ({
    "Name": [c.nombre, c.apellidos].filter(Boolean).join(" "), "Given Name": c.nombre, "Family Name": c.apellidos ?? "",
    "Organization 1 - Name": c.empresa ?? "", "Organization 1 - Title": c.cargo ?? "",
    "E-mail 1 - Type": c.email ? "Work" : "", "E-mail 1 - Value": c.email ?? "", "E-mail 2 - Type": c.emailAlternativo ? "Other" : "", "E-mail 2 - Value": c.emailAlternativo ?? "",
    "Phone 1 - Type": c.telefono ? "Mobile" : "", "Phone 1 - Value": c.telefono ?? "", "Phone 2 - Type": c.telefonoAlternativo ? "Other" : "", "Phone 2 - Value": c.telefonoAlternativo ?? "",
    "Address 1 - Type": c.direccion ? "Home" : "", "Address 1 - Street": c.direccion ?? "", "Address 1 - City": c.ciudad ?? "", "Address 1 - Region": c.provincia ?? "", "Address 1 - Postal Code": c.codigoPostal ?? "", "Address 1 - Country": c.pais ?? "",
    "Website 1 - Type": c.sitioWeb ? "Profile" : "", "Website 1 - Value": c.sitioWeb ?? "", "Birthday": c.fechaNacimiento ?? "", "Notes": c.notas ?? "",
  })));
}

export function exportContactosExcelCsv(contactos: Contacto[]) {
  return csv(contactos.map((c) => ({
    "Nombre": c.nombre, "Apellidos": c.apellidos ?? "", "Empresa": c.empresa ?? "", "Cargo": c.cargo ?? "",
    "Email": c.email ?? "", "Email alternativo": c.emailAlternativo ?? "", "Teléfono": c.telefono ?? "", "Teléfono alternativo": c.telefonoAlternativo ?? "",
    "Dirección": c.direccion ?? "", "Ciudad": c.ciudad ?? "", "Provincia": c.provincia ?? "", "Código postal": c.codigoPostal ?? "", "País": c.pais ?? "",
    "Sitio web": c.sitioWeb ?? "", "Fecha de nacimiento": c.fechaNacimiento ?? "", "Notas": c.notas ?? "",
  })));
}
