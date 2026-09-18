// src/lib/csv.ts

export type CsvValue = string | number | null | undefined;
export type CsvColumn<T> = { key: keyof T; label: string };

// RFC-4180-style quoting: a field is wrapped in double quotes only if it
// contains a comma, a double quote, or a line break (CR or LF); an internal
// double quote is escaped by doubling it.
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Student names and free text are exported and opened in spreadsheets, so a
// string starting with a formula trigger is prefixed with ' to force text.
// Numbers are never prefixed (negative numbers must stay numeric).
function sanitizeCell(value: CsvValue): string {
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return String(value ?? "");
}

export function toCsv<T extends Record<string, CsvValue>>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(sanitizeCell(row[c.key]))).join(",")
  );
  return [header, ...lines].join("\r\n");
}
