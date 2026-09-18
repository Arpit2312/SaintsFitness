"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, type CsvColumn, type CsvValue } from "@/lib/csv";

export function ExportButton<T extends Record<string, CsvValue>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string;
}) {
  function handleExport() {
    const csv = toCsv(rows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download size={14} className="mr-2" />
      Export CSV
    </Button>
  );
}
