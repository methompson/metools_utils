import { split } from './split';

describe('split', () => {
  test('splits an array based on a filter operation', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const [even, odd] = split(arr, (num) => num % 2 === 0);
    expect(even).toEqual([2, 4, 6]);
    expect(odd).toEqual([1, 3, 5]);
  });

  test('returns empty arrays when no elements match', () => {
    const arr = [1, 3, 5];
    const [even, odd] = split(arr, (num) => num % 2 === 0);
    expect(even).toEqual([]);
    expect(odd).toEqual([1, 3, 5]);
  });

  test('can handle an empty array', () => {
    const arr: number[] = [];
    const [even, odd] = split(arr, (num) => num % 2 === 0);
    expect(even).toEqual([]);
    expect(odd).toEqual([]);
  });

  test('can handle an array with multiple types', () => {
    const arr = [1, 'two', 3, 'four', 5, true, null, {}, []];
    const [numbers, others] = split(arr, (item) => typeof item === 'number');
    expect(numbers).toEqual([1, 3, 5]);
    expect(others).toEqual(['two', 'four', true, null, {}, []]);
  });
});
