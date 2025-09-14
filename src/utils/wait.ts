/**
 * Waits for a specified amount of time.
 * @param ms milliseconds to wait
 * @returns a promise that resolves after the specified time
 */
export async function wait(ms?: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
