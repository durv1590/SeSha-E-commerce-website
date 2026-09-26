import { reviewerName } from './rating';

describe('reviewerName', () => {
  it('shows first name and last initial only', () => {
    expect(reviewerName('Asha Rao')).toBe('Asha R.');
    expect(reviewerName('  meera   k  iyer ')).toBe('meera I.');
    expect(reviewerName('Ravi')).toBe('Ravi');
    expect(reviewerName('   ')).toBe('Customer');
  });
});
