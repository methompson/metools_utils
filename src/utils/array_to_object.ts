/**
 * Converts an array of values into an object with the same values.
 * The keygen determines the key of the object for each value. The purpose of this
 * functions is to make it easier to access values in an array using an obvious
 * and unique key, e.g. an id. Using this should be faster than iterating through
 * the array to find the value.
 */
export function arrayToObject<T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T> {
  const output: Record<string | number, T> = {};

  for (const i of input) {
    output[keygen(i)] = i;
  }

  return output;
}

/**
 * Converts an array of values into an object with common values
 * grouped together in an array. The keygen determines the key of the object for
 * each value. The purpose of this function is to group values with similar
 * attributes together for easier access. e.g. grouping shifts together for
 * specific stores or employees.
 */
export function arrayToGroup<T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T[]> {
  const output: Record<string | number, T[]> = {};

  for (const i of input) {
    const key = keygen(i);

    const arr = output[key] ?? [];
    arr.push(i);
    output[key] = arr;
  }

  return output;
}

/**
 * mappedArrayToObject is kind of like a combination of arrayToMap and Array.map
 * combined together. Like arrayToMap, it converts the array of values into an
 * object using the keygen to create the keys. The valuegen converts the original
 * value into a new value. This is useful for situations where you may want to have
 * a computed value to use en masse.
 */
export function mappedArrayToObject<T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U> {
  const output: Record<string | number, U> = {};

  for (const i of input) {
    output[keygen(i)] = valuegen(i);
  }

  return output;
}

/**
 * mappedArrayToGroup does the same things as mappedArrayToObject, but also combines
 * the values into an array. This is useful for situations where you may want to
 * transform the values before grouping them together.
 */
export function mappedArrayToGroup<T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U[]> {
  const output: Record<string | number, U[]> = {};

  for (const i of input) {
    const key = keygen(i);

    const arr = output[key] ?? [];
    arr.push(valuegen(i));
    output[key] = arr;
  }

  return output;
}
