import { describe, expect, it } from "vitest";

import { exportContactosExcelCsv, exportContactosGoogleCsv, parseContactosCsv } from "@/lib/contactosCsv";
import type { Contacto } from "@/types";

const contacto: Contacto = {
  id: 1, nombre: "Ana", apellidos: "Pérez", empresa: "Perfumes, Sur", cargo: "Compras",
  email: "ana@example.com", emailAlternativo: "ventas@example.com", telefono: "+56 9 1234 5678",
  telefonoAlternativo: "", direccion: "Av. Central 123", ciudad: "Santiago", provincia: "RM",
  codigoPostal: "8320000", pais: "Chile", sitioWeb: "https://example.com", fechaNacimiento: "1990-04-03",
  notas: "Cliente mayorista\nContacto principal", creadoEn: "2026-06-01", actualizadoEn: "2026-06-01",
};

describe("CSV de contactos", () => {
  it("importa el formato de Google Contacts preservando campos y comas", () => {
    const csv = 'Name,Given Name,Family Name,Organization 1 - Name,E-mail 1 - Value,Phone 1 - Value,Notes\r\n"Ana Pérez",Ana,Pérez,"Perfumes, Sur",ana@example.com,"+56 9 1234 5678","Cliente, mayorista"';
    const result = parseContactosCsv(csv);

    expect(result.errores).toEqual([]);
    expect(result.contactos[0]).toMatchObject({
      nombre: "Ana", apellidos: "Pérez", empresa: "Perfumes, Sur",
      email: "ana@example.com", telefono: "+56 9 1234 5678", notas: "Cliente, mayorista",
    });
  });

  it("exporta formatos compatibles con Google y Excel que pueden reimportarse", () => {
    const google = exportContactosGoogleCsv([contacto]);
    const excel = exportContactosExcelCsv([contacto]);

    expect(google).toContain('"Given Name"');
    expect(excel).toContain('"Teléfono"');
    expect(parseContactosCsv(google).contactos[0]).toMatchObject({ nombre: "Ana", apellidos: "Pérez", email: "ana@example.com" });
    expect(parseContactosCsv(excel).contactos[0]).toMatchObject({ nombre: "Ana", apellidos: "Pérez", empresa: "Perfumes, Sur" });
  });

  it("detecta automáticamente un CSV de Excel separado por punto y coma", () => {
    const result = parseContactosCsv("Nombre;Apellidos;Email;Teléfono\r\nLuis;Soto;luis@example.com;+56911112222");
    expect(result.contactos[0]).toMatchObject({ nombre: "Luis", apellidos: "Soto", email: "luis@example.com", telefono: "+56911112222" });
  });
});
