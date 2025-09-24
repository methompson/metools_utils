import {
  runTaskQueue,
  TaskQueue,
  TaskQueueCompletedEvent,
  TaskQueueErrorEvent,
} from './task_queue';

describe('TaskQueue', () => {
  test('can execute several tasks at the same time', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const start = performance.now();

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    const end = performance.now();

    expect(fn).toHaveBeenCalledTimes(20);
    expect(end - start).toBeLessThan(20);
  });

  test('provides information on completed and failed tasks', async () => {
    const successfulTask = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const successTasks = Array.from({ length: 10 }, () => successfulTask);
    const failedTasks = Array.from({ length: 10 }, () => failingTask);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [...successTasks, ...failedTasks],
    });

    const start = performance.now();

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
        expect(ev instanceof TaskQueueCompletedEvent).toBe(true);
        if (ev instanceof TaskQueueCompletedEvent) {
          expect(ev.successfulTasks).toBe(10);
          expect(ev.failedTasks).toBe(10);
        } else {
          rej();
        }
        res();
      });
      taskQueue.startExecution();
    });

    const end = performance.now();

    expect(successfulTask).toHaveBeenCalledTimes(10);
    expect(failingTask).toHaveBeenCalledTimes(10);
    expect(end - start).toBeLessThan(20);
  });

  test('sends events for all failed and successful tasks', async () => {
    const successfulTask = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const successTasks = Array.from({ length: 10 }, () => successfulTask);
    const failedTasks = Array.from({ length: 10 }, () => failingTask);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [...successTasks, ...failedTasks],
    });

    const start = performance.now();

    let totalFailed = 0;
    let totalSuccessful = 0;
    await new Promise<void>((res) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_COMPLETED, () => {
        totalSuccessful += 1;
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        totalFailed += 1;
      });
      taskQueue.startExecution();
    });

    const end = performance.now();

    expect(totalFailed).toBe(10);
    expect(totalSuccessful).toBe(10);
    expect(successfulTask).toHaveBeenCalledTimes(10);
    expect(failingTask).toHaveBeenCalledTimes(10);
    expect(end - start).toBeLessThan(20);
  });

  test('Passes an error object with the TASK_ERROR event', async () => {
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask],
    });

    await new Promise<void>((res) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, (ev) => {
        expect(ev instanceof TaskQueueErrorEvent).toBe(true);
        if (ev instanceof TaskQueueErrorEvent) {
          expect(ev.error).toBeInstanceOf(Error);
          expect((ev.error as Error).message).toBe('Task failed');
        }
      });
      taskQueue.startExecution();
    });

    expect(failingTask).toHaveBeenCalledTimes(1);
  });

  test('can handle an empty task list', async () => {
    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [],
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    expect(true).toBe(true);
  });

  test('can handle more tasks than workers', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 100 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const start = performance.now();

    await new Promise<void>((res, rej) => {
      taskQueue.startExecution();
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
    });

    const end = performance.now();

    // 100 tasks, 10ms per 30 workers. math.ceil(100 / 30) = 4.
    // 10 ms per group = 40ms total.
    expect(fn).toHaveBeenCalledTimes(100);
    expect(end - start).toBeLessThan(50);
  });

  test('can retry failed tasks a set number of times', async () => {
    const successfulTasks = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 1);
        }),
    );

    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 1);
        }),
    );

    const severalTasks = Array.from({ length: 20 }, () => successfulTasks);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask, ...severalTasks],
      retries: 3,
    });

    const ev = await new Promise<TaskQueueCompletedEvent>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
        expect(ev instanceof TaskQueueCompletedEvent).toBe(true);
        if (ev instanceof TaskQueueCompletedEvent) {
          res(ev);
        }

        rej();
      });
      taskQueue.startExecution();
    });

    expect(ev.successfulTasks).toBe(20);
    expect(ev.failedTasks).toBe(4);

    // 21 total tasks, 20 above and 1 failing task retried 4 times
    expect(ev.totalTasks).toBe(21);
  });

  test('shows a failed task that succeeds later as both failed and successful', async () => {
    let run = false;
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            if (!run) {
              run = true;
              rej(new Error('Task failed'));
            } else {
              res();
            }
          }, 1);
        }),
    );

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask],
      retries: 1,
    });

    const ev = await new Promise<TaskQueueCompletedEvent>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
        expect(ev instanceof TaskQueueCompletedEvent).toBe(true);
        if (ev instanceof TaskQueueCompletedEvent) {
          res(ev);
        }

        rej();
      });
      taskQueue.startExecution();
    });

    expect(ev.successfulTasks).toBe(1);
    expect(ev.failedTasks).toBe(1);

    // 21 total tasks, 20 above and 1 failing task retried 1 time
    expect(ev.totalTasks).toBe(1);
  });

  test('can stop a queue', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 5,
      tasks: severalTasks,
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
      taskQueue.stop();
    });

    // expect(fn).toHaveBeenCalledTimes(5);
  });

  test('event listeners can be cleared', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 5,
      tasks: severalTasks,
    });

    let initialEventListnerRun = 0;

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
        initialEventListnerRun += 1;

        taskQueue.clearAllEventListeners();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
      taskQueue.stop();
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    expect(initialEventListnerRun).toBe(1);
    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('can restart after being stopped', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 5,
      tasks: severalTasks,
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
      taskQueue.stop();
    });

    taskQueue.clearAllEventListeners();

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('the queue can be cleared', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 5,
      tasks: severalTasks,
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
      taskQueue.stop();
    });

    expect(fn).toHaveBeenCalledTimes(5);

    taskQueue.clearAllEventListeners();
    taskQueue.clearQueue();

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    // Unchanged
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

describe('runTaskQueue', () => {
  test('can execute several tasks at the same time', async () => {
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const start = performance.now();

    await runTaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const end = performance.now();

    expect(fn).toHaveBeenCalledTimes(20);
    expect(end - start).toBeLessThan(20);
  });

  test('provides information on completed and failed tasks', async () => {
    const successfulTask = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const successTasks = Array.from({ length: 10 }, () => successfulTask);
    const failedTasks = Array.from({ length: 10 }, () => failingTask);

    const start = performance.now();

    const result = await await runTaskQueue({
      totalWorkers: 30,
      tasks: [...successTasks, ...failedTasks],
    });

    expect(result instanceof TaskQueueCompletedEvent).toBe(true);

    expect(result.successfulTasks).toBe(10);
    expect(result.failedTasks).toBe(10);

    const end = performance.now();

    expect(successfulTask).toHaveBeenCalledTimes(10);
    expect(failingTask).toHaveBeenCalledTimes(10);
    expect(end - start).toBeLessThan(20);
  });

  test('runs a callback on task queue completion', async () => {
    expect(true).toBe(false);
  });
  test('runs a callback on task error', async () => {
    expect(true).toBe(false);
  });
  test('runs a callback on task completion', async () => {
    expect(true).toBe(false);
  });

  test('sends events for all failed and successful tasks', async () => {
    expect(true).toBe(false);
    const successfulTask = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const successTasks = Array.from({ length: 10 }, () => successfulTask);
    const failedTasks = Array.from({ length: 10 }, () => failingTask);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [...successTasks, ...failedTasks],
    });

    const start = performance.now();

    let totalFailed = 0;
    let totalSuccessful = 0;
    await new Promise<void>((res) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_COMPLETED, () => {
        totalSuccessful += 1;
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        totalFailed += 1;
      });
      taskQueue.startExecution();
    });

    const end = performance.now();

    expect(totalFailed).toBe(10);
    expect(totalSuccessful).toBe(10);
    expect(successfulTask).toHaveBeenCalledTimes(10);
    expect(failingTask).toHaveBeenCalledTimes(10);
    expect(end - start).toBeLessThan(20);
  });

  test('Passes an error object with the TASK_ERROR event', async () => {
    expect(true).toBe(false);
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 10);
        }),
    );

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask],
    });

    await new Promise<void>((res) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, (ev) => {
        expect(ev instanceof TaskQueueErrorEvent).toBe(true);
        if (ev instanceof TaskQueueErrorEvent) {
          expect(ev.error).toBeInstanceOf(Error);
          expect((ev.error as Error).message).toBe('Task failed');
        }
      });
      taskQueue.startExecution();
    });

    expect(failingTask).toHaveBeenCalledTimes(1);
  });

  test('can handle an empty task list', async () => {
    expect(true).toBe(false);
    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [],
    });

    await new Promise<void>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
      taskQueue.startExecution();
    });

    expect(true).toBe(true);
  });

  test('can handle more tasks than workers', async () => {
    expect(true).toBe(false);
    const fn = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 10);
        }),
    );
    const severalTasks = Array.from({ length: 100 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const start = performance.now();

    await new Promise<void>((res, rej) => {
      taskQueue.startExecution();
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
        res();
      });
      taskQueue.addEventListener(TaskQueue.TASK_ERROR, () => {
        rej();
      });
    });

    const end = performance.now();

    // 100 tasks, 10ms per 30 workers. math.ceil(100 / 30) = 4.
    // 10 ms per group = 40ms total.
    expect(fn).toHaveBeenCalledTimes(100);
    expect(end - start).toBeLessThan(50);
  });

  test('can retry failed tasks a set number of times', async () => {
    expect(true).toBe(false);
    const successfulTasks = vi.fn(
      async () =>
        new Promise<void>((res) => {
          setTimeout(() => {
            res();
          }, 1);
        }),
    );

    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            rej(new Error('Task failed'));
          }, 1);
        }),
    );

    const severalTasks = Array.from({ length: 20 }, () => successfulTasks);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask, ...severalTasks],
      retries: 3,
    });

    const ev = await new Promise<TaskQueueCompletedEvent>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
        expect(ev instanceof TaskQueueCompletedEvent).toBe(true);
        if (ev instanceof TaskQueueCompletedEvent) {
          res(ev);
        }

        rej();
      });
      taskQueue.startExecution();
    });

    expect(ev.successfulTasks).toBe(20);
    expect(ev.failedTasks).toBe(4);

    // 21 total tasks, 20 above and 1 failing task retried 4 times
    expect(ev.totalTasks).toBe(21);
  });

  test('shows a failed task that succeeds later as both failed and successful', async () => {
    expect(true).toBe(false);
    let run = false;
    const failingTask = vi.fn(
      async () =>
        new Promise<void>((res, rej) => {
          setTimeout(() => {
            if (!run) {
              run = true;
              rej(new Error('Task failed'));
            } else {
              res();
            }
          }, 1);
        }),
    );

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: [failingTask],
      retries: 1,
    });

    const ev = await new Promise<TaskQueueCompletedEvent>((res, rej) => {
      taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
        expect(ev instanceof TaskQueueCompletedEvent).toBe(true);
        if (ev instanceof TaskQueueCompletedEvent) {
          res(ev);
        }

        rej();
      });
      taskQueue.startExecution();
    });

    expect(ev.successfulTasks).toBe(1);
    expect(ev.failedTasks).toBe(1);

    // 21 total tasks, 20 above and 1 failing task retried 1 time
    expect(ev.totalTasks).toBe(1);
  });
});
