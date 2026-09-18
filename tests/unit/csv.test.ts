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

  it("quotes a header label containing a comma", () => {
    const csv = toCsv([{ amount: 1 }], [{ key: "amount", label: "Amount, INR" }]);
    expect(csv).toBe('"Amount, INR"\r\n1');
  });

  it("doubles a quote inside a header label", () => {
    const csv = toCsv([{ note: "x" }], [{ key: "note", label: 'The "Note"' }]);
    expect(csv).toBe('"The ""Note"""\r\nx');
  });

  it("renders the number 0 as 0", () => {
    const csv = toCsv([{ amount: 0 }], [{ key: "amount", label: "Amount" }]);
    expect(csv).toBe("Amount\r\n0");
  });

  it("leaves a negative number unprefixed", () => {
    const csv = toCsv([{ amount: -5 }], [{ key: "amount", label: "Amount" }]);
    expect(csv).toBe("Amount\r\n-5");
  });

  it("prefixes a string cell starting with = to neutralise formulas", () => {
    const csv = toCsv([{ note: "=SUM(A1)" }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe("Note\r\n'=SUM(A1)");
  });

  it.each(["+1", "-1", "@cmd"])(
    "prefixes a string cell starting with %s",
    (value) => {
      const csv = toCsv([{ note: value }], [{ key: "note", label: "Note" }]);
      expect(csv).toBe(`Note\r\n'${value}`);
    }
  );

  it("prefixes first, then quotes, a formula string containing a comma", () => {
    const csv = toCsv([{ note: "=a,b" }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"\'=a,b"');
  });

  it("leaves a normal string untouched", () => {
    const csv = toCsv([{ name: "Asha" }], [{ key: "name", label: "Name" }]);
    expect(csv).toBe("Name\r\nAsha");
  });

  it("quotes a field containing a lone carriage return", () => {
    const csv = toCsv([{ note: "a\rb" }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"a\rb"');
  });

  it("renders a multi-column row mixing a quoted and a plain field", () => {
    const csv = toCsv(
      [{ name: "Doe, John", amount: 500 }],
      [
        { key: "name", label: "Name" },
        { key: "amount", label: "Amount" },
      ]
    );
    expect(csv).toBe('Name,Amount\r\n"Doe, John",500');
  });
});
