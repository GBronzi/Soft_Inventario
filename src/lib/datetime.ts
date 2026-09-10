export function localDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

export function parseDatabaseDate(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) return new Date(`${raw.replace(" ", "T")}Z`);
  return new Date(raw);
}

export function formatDatabaseDate(value: string | null | undefined, locale = "es-AR") {
  const date = parseDatabaseDate(value);
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale) : "-";
}

export function formatDatabaseTime(value: string | null | undefined, locale = "es-AR") {
  const date = parseDatabaseDate(value);
  return date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "--:--";
}
