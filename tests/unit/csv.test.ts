// tests/unit/csv.test.ts
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("renders a header row and one row per record", () => {
    const csv = toCsv(
      [
        { name: "Asha", amount: 500 },
        { name: "Ravi", amount: 1200 },
      ],
      [
        { key: "name", label: "Name" },
        { key: "amount", label: "Amount" },
      ]
    );
    expect(csv).toBe("Name,Amount\r\nAsha,500\r\nRavi,1200");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv([{ name: "Doe, John" }], [{ key: "name", label: "Name" }]);
    expect(csv).toBe('Name\r\n"Doe, John"');
  });

  it("quotes a field containing a double quote, doubling the internal quote", () => {
    const csv = toCsv([{ note: 'Said "hello"' }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"Said ""hello"""');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ note: "line1\nline2" }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"line1\nline2"');
  });

  it("produces a header-only CSV for an empty rows array", () => {
    const csv = toCsv([], [{ key: "name", label: "Name" }]);
    expect(csv).toBe("Name");
  });

  it("renders an empty string for a null/undefined field value", () => {
    const csv = toCsv([{ name: undefined }], [{ key: "name", label: "Name" }]);
    expect(csv).toBe("Name\r\n");
  });
});
