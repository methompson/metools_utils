/**
 * Converts any data structure into a plain object by serializing
 * it to JSON and then back to a JavaScript object. This can be used to cut down
 * on complexity and make the data easier to work with, especially with objects
 * that have a lot of getters or computed properties or proxies. This is more
 * of a debugging tool than a production-ready solution.
 */
export function toPlainObject(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Alias for toPlainObject for simpler usage.
 */
export const xyz = toPlainObject;
