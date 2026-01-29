export function isUndefinedOrNull(input: unknown): input is undefined | null {
  return input === undefined || input === null;
}
