import { OrderByDateDescPipe } from './order-by-date-desc.pipe';

describe('OrderByDateDescPipe', () => {
  const pipe = new OrderByDateDescPipe();

  it('sorts a copy of date-bearing objects from newest to oldest', () => {
    const original = [{ id: 1, date: '2024-01-01' }, { id: 2, date: '2024-03-01' }, { id: 3, date: '2023-12-31' }];

    expect(pipe.transform(original).map(item => item.id)).toEqual([2, 1, 3]);
    expect(original.map(item => item.id)).toEqual([1, 2, 3]);
  });

  it('returns non-array values unchanged', () => {
    const value = { date: '2024-01-01' } as any;

    expect(pipe.transform(value)).toBe(value);
  });
});
