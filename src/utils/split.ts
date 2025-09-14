/**
 * Splits an array into two arrays based on a filter operation. Used to separate items
 * that pass a filter operation and those that do not.
 * @param arr Array to split
 * @param filterOp Function to determine if an element should be included in the "pass" array
 * @returns A tuple containing the "pass" and "fail" arrays
 */
export function split<T>(
  arr: T[],
  filterOp: (value: T, index: number, array: T[]) => unknown,
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const entry of arr) {
    if (filterOp(entry, arr.indexOf(entry), arr)) {
      pass.push(entry);
    } else {
      fail.push(entry);
    }
  }
  return [pass, fail];
}
