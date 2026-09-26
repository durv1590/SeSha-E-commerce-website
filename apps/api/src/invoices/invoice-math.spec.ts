import {
  amountInWords,
  financialYear,
  formatInvoiceNumber,
  isIntraState,
  numberInWords,
  splitTax,
} from './invoice-math';

describe('invoice arithmetic', () => {
  it('uses the Indian financial year (April–March, India time)', () => {
    expect(financialYear(new Date('2026-09-26T10:00:00Z'))).toBe('26-27');
    expect(financialYear(new Date('2027-03-31T18:00:00Z'))).toBe('26-27'); // 31 Mar 23:30 IST
    expect(financialYear(new Date('2027-03-31T18:31:00Z'))).toBe('27-28'); // 1 Apr 00:01 IST
    expect(financialYear(new Date('2099-06-01T00:00:00Z'))).toBe('99-00');
    expect(formatInvoiceNumber(123, new Date('2026-09-26T10:00:00Z'))).toBe('SK/26-27/000123');
    expect(formatInvoiceNumber(123, new Date('2026-09-26T10:00:00Z')).length).toBeLessThanOrEqual(
      16,
    );
  });

  it('splits GST into CGST + SGST within the state and IGST across states', () => {
    const line = { lineTotal: 23_600, discountAmount: 0, taxAmount: 3_600, taxRate: 18 };
    expect(splitTax(line, true)).toEqual({
      gross: 23_600,
      taxable: 20_000,
      cgst: 1_800,
      sgst: 1_800,
      igst: 0,
    });
    expect(splitTax(line, false)).toEqual({
      gross: 23_600,
      taxable: 20_000,
      cgst: 0,
      sgst: 0,
      igst: 3_600,
    });
    // An odd paisa goes to SGST so the halves always add up.
    expect(splitTax({ ...line, taxAmount: 3_601 }, true)).toMatchObject({
      cgst: 1_800,
      sgst: 1_801,
    });
    expect(splitTax({ ...line, discountAmount: 2_360, taxAmount: 3_240 }, true)).toMatchObject({
      gross: 21_240,
      taxable: 18_000,
    });
  });

  it('compares states loosely and treats an unset seller state as inter-state', () => {
    expect(isIntraState('Maharashtra', ' maharashtra ')).toBe(true);
    expect(isIntraState('Maharashtra', 'Karnataka')).toBe(false);
    expect(isIntraState('', 'Karnataka')).toBe(false);
  });

  it('writes amounts in words in the Indian system', () => {
    expect(numberInWords(0)).toBe('Zero');
    expect(numberInWords(1548)).toBe('One Thousand Five Hundred Forty Eight');
    expect(numberInWords(1_00_000)).toBe('One Lakh');
    expect(numberInWords(12_34_56_789)).toBe(
      'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine',
    );
    expect(amountInWords(154_850)).toBe(
      'Rupees One Thousand Five Hundred Forty Eight and Fifty Paise Only',
    );
    expect(amountInWords(99_900)).toBe('Rupees Nine Hundred Ninety Nine Only');
  });
});
