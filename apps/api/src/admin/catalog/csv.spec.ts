import { csvField, parseCsv, toCsv, unescapeFormula } from './csv';

describe('parseCsv', () => {
  it('reads quoted fields with commas, quotes and line breaks', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\n1,,3\n');
    expect(rows).toEqual([
      { line: 1, fields: ['a', 'b', 'c'] },
      { line: 2, fields: ['x, y', 'say "hi"', 'line1\nline2'] },
      { line: 4, fields: ['1', '', '3'] },
    ]);
  });

  it('ignores a BOM, blank lines and a missing trailing newline', () => {
    expect(parseCsv('﻿a,b\n\n1,2')).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 3, fields: ['1', '2'] },
    ]);
  });

  it('keeps trailing empty fields', () => {
    expect(parseCsv('a,b,\n')[0]!.fields).toEqual(['a', 'b', '']);
  });

  it('rejects an unterminated quote and a stray quote', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/not closed/);
    expect(() => parseCsv('ab"c,d')).toThrow(/inside an unquoted field/);
  });
});

describe('csvField / toCsv', () => {
  it('quotes when needed and neutralises formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-5')).toBe('-5');
    expect(csvField(null)).toBe('');
    expect(csvField(1299)).toBe('1299');
  });

  it('round-trips through parseCsv', () => {
    const data = [
      ['name', 'note'],
      ['Tee, blue', 'multi\nline "quoted"'],
      ['=cmd', ' padded '],
    ];
    const parsed = parseCsv(toCsv(data)).map((r) => r.fields.map(unescapeFormula));
    expect(parsed).toEqual(data);
  });
});
