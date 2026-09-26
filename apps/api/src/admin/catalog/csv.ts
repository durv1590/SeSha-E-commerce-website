/**
 * Minimal RFC 4180 CSV reader/writer for catalogue import and export.
 * Quoted fields may contain commas, quotes ("") and line breaks; CRLF and LF are both
 * accepted, and a UTF-8 byte-order mark (Excel) is ignored.
 */

export class CsvError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** Parses CSV text into rows of fields; each row carries its starting line number. */
export function parseCsv(input: string): { line: number; fields: string[] }[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let fieldStarted = false;

  const endField = () => {
    fields.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    // Skip blank lines (a single empty field).
    if (!(fields.length === 1 && fields[0] === '')) rows.push({ line: rowLine, fields });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (fieldStarted && field.length > 0)
        throw new CsvError('A quote appears inside an unquoted field', line);
      quoted = true;
      fieldStarted = true;
    } else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (quoted) throw new CsvError('A quoted field is not closed', rowLine);
  if (field !== '' || fields.length) endRow();
  return rows;
}

/**
 * Serialises one field. Values that a spreadsheet would run as a formula
 * (starting with = + - @, tab or carriage return) are prefixed with an apostrophe
 * (CSV injection), unless they are plain numbers such as "-5".
 */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Strips the apostrophe `csvField` adds, so an exported file re-imports unchanged. */
export function unescapeFormula(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
