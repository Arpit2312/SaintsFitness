const SEQUENCE_WIDTH = 5;

/**
 * Receipt numbers are `{prefix}-{year}-{seq}` or `{prefix}-{seq}`. The prefix
 * is validated to letters/digits only (no hyphen), so the two shapes -- and
 * different prefixes -- can never produce the same string, which matters
 * because Receipt.receiptNumber is unique.
 */
export function formatReceiptNumber({
  prefix,
  includeYear,
  year,
  sequence,
}: {
  prefix: string;
  includeYear: boolean;
  year: number;
  sequence: number;
}): string {
  const padded = String(sequence).padStart(SEQUENCE_WIDTH, "0");
  return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}

/**
 * A year-less number must not restart every January (it would repeat), so it
 * uses one global counter; a year-bearing number keeps a counter per year.
 */
export function receiptSequenceName(includeYear: boolean, year: number): string {
  return includeYear ? `receipt-${year}` : "receipt-all";
}
