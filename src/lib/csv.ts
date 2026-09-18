// src/lib/csv.ts

export type CsvValue = string | number | null | undefined;
export type CsvColumn<T> = { key: keyof T; label: string };

// RFC-4180-style quoting: a field is wrapped in double quotes only if it
// contains a comma, a double quote, or a newline; an internal double quote
// is escaped by doubling it.
function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T extends Record<string, CsvValue>>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(String(row[c.key] ?? ""))).join(",")
  );
  return [header, ...lines].join("\r\n");
}
