import { wait } from './wait';

describe('wait Utility', () => {
  test('waits for the specified time', async () => {
    const start = performance.now();
    await wait(50);
    const end = performance.now();
    expect(end - start).toBeGreaterThanOrEqual(50);
  });

  test('waits for an extended period of time', async () => {
    vi.useFakeTimers();

    const time = 1000 * 60 * 60 * 2; // 2 hours

    const start = performance.now();
    wait(time);
    vi.advanceTimersByTime(time);
    const end = performance.now();
    expect(end - start).toBeGreaterThanOrEqual(time);

    vi.restoreAllMocks();
  });
});
