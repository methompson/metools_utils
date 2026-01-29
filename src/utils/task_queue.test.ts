import {
  TaskQueue,
  TaskQueueCompletedEvent,
  TaskQueueErrorEvent,
} from './task_queue';
import { wait } from './wait';

describe('TaskQueue', () => {
  describe('getters', () => {
    describe('pendingTasks', () => {
      test('returns all tasks if the queue has not started', () => {
        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 30,
          tasks: severalTasks,
        });

        expect(taskQueue.pendingTasks).toBe(20);

        expect(fn).not.toHaveBeenCalled();
      });

      test('returns remaining tasks if the queue is running', async () => {
        expect.assertions(1);
        const fn = vi.fn(() => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 1,
          tasks: severalTasks,
        });

        let i = 0;

        await new Promise<void>((res, rej) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
            onTaskCompleted() {
              try {
                i++;

                if (i === 10) {
                  expect(taskQueue.pendingTasks).toBe(10);
                }
              } catch (_) {
                rej();
              }
            },
          });
        });
      });

      test('pending tasks goes up if you add more tasks while running', async () => {
        expect.assertions(2);
        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 1,
          tasks: severalTasks,
        });

        let i = 0;

        await new Promise<void>((res, rej) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
            onTaskCompleted() {
              try {
                i++;
                if (i === 10) {
                  expect(taskQueue.pendingTasks).toBe(10);
                  taskQueue.addTasks([fn]);
                  expect(taskQueue.pendingTasks).toBe(11);
                }
              } catch (_) {
                rej();
              }
            },
          });
        });
      });

      test('returns 0 if all tasks have completed', async () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 30,
          tasks: severalTasks,
        });

        expect(taskQueue.pendingTasks).toBe(severalTasks.length);

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.pendingTasks).toBe(0);
      });
    });

    describe('completedTasks', () => {
      test('returns 0 if the queue has not started', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 30,
          tasks: severalTasks,
        });

        expect(taskQueue.completedTasks).toBe(0);
      });

      test('returns 0 if no tasks have completed', async () => {
        const fn = vi.fn(() => {
          throw new Error('Not completed yet');
        });
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 30,
          tasks: severalTasks,
        });

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.completedTasks).toBe(0);
      });

      test('returns the number of tasks that have completed', async () => {
        expect.assertions(1);
        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 1,
          tasks: severalTasks,
        });

        let i = 0;

        await new Promise<void>((res, rej) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
            onTaskCompleted() {
              try {
                i++;
                if (i === 10) {
                  expect(taskQueue.completedTasks).toBe(10);
                }
              } catch (_) {
                rej();
              }
            },
          });
        });
      });

      test('completedTasks does not go up if you add a task', async () => {
        expect.assertions(2);
        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 1,
          tasks: severalTasks,
        });

        let i = 0;

        await new Promise<void>((res, rej) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
            onTaskCompleted() {
              try {
                i++;
                if (i === 10) {
                  expect(taskQueue.completedTasks).toBe(10);

                  taskQueue.addTasks([fn]);

                  expect(taskQueue.completedTasks).toBe(10);
                }
              } catch (_) {
                rej();
              }
            },
          });
        });
      });

      test('returns the total number of tasks if all tasks have completed', async () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.completedTasks).toBe(0);

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.completedTasks).toBe(severalTasks.length);
      });
    });

    describe('failedTasks', () => {
      test('returns 0 if the queue has not started', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.failedTasks).toBe(0);
      });

      test('returns 0 if no tasks have failed', async () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.failedTasks).toBe(0);

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.failedTasks).toBe(0);
      });

      test('returns the number of tasks that have failed', async () => {
        let i = 0;
        const fn = vi.fn(() => {
          i++;
          if (i % 2 === 0) {
            throw new Error('Task failed');
          }
        });
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.completedTasks).toBe(0);

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.completedTasks).toBe(severalTasks.length / 2);
        expect(taskQueue.failedTasks).toBe(severalTasks.length / 2);
      });
    });

    describe('totalWorkers', () => {
      test('returns the total number of workers assigned to the queue', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueueA = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueueA.totalWorkers).toBe(20);

        const taskQueueB = new TaskQueue({
          totalWorkers: 5,
          tasks: severalTasks,
        });

        expect(taskQueueB.totalWorkers).toBe(5);
      });
    });

    describe('totalTasks', () => {
      test('returns the total number of tasks in the queue', () => {
        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.totalWorkers).toBe(20);
      });

      test('adding more tasks will increase the total tasks count', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.totalTasks).toBe(20);

        taskQueue.addTasks([fn, fn, fn]);

        expect(taskQueue.totalTasks).toBe(23);
      });
    });

    describe('activeTasks', () => {
      test('returns 0 if the queue has not started', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.activeTasks).toBe(0);
      });

      test('returns the number of tasks that are currently running', async () => {
        expect.assertions(2);

        const fn = vi.fn(async () => wait(1));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 5,
          tasks: severalTasks,
        });

        let i = 0;
        await new Promise<void>((res, rej) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
            onTaskCompleted() {
              try {
                i++;

                if (i === 10) {
                  expect(taskQueue.activeTasks).toBe(5);
                }

                if (i === 20) {
                  expect(taskQueue.activeTasks).toBe(1);
                }
              } catch (_) {
                rej();
              }
            },
          });
        });
      });

      test('returns 0 if all tasks have completed', async () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        await new Promise<void>((res) => {
          taskQueue.startExecution({
            onWorkersIdle: () => res(),
          });
        });

        expect(taskQueue.activeTasks).toBe(0);
      });
    });

    describe('idleWorkers', () => {
      test('returns total workers if the queue has not started', () => {
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        expect(taskQueue.idleWorkers).toBe(20);
      });

      test('returns 0 idle workers when tasks are running', async () => {
        expect.assertions(1);
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 300 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        await new Promise<void>((res, rej) => {
          try {
            taskQueue.startExecution({
              onWorkersIdle: () => res(),
            });
            expect(taskQueue.idleWorkers).toBe(0);
          } catch {
            rej();
          }
        });
      });

      test('returns total workers if all tasks have completed', async () => {
        expect.assertions(1);
        const fn = vi.fn();
        const severalTasks = Array.from({ length: 300 }, () => fn);

        const taskQueue = new TaskQueue({
          totalWorkers: 20,
          tasks: severalTasks,
        });

        await new Promise<void>((res, rej) => {
          try {
            taskQueue.startExecution({
              onWorkersIdle: () => res(),
            });
          } catch {
            rej();
          }
        });

        expect(taskQueue.idleWorkers).toBe(taskQueue.totalWorkers);
      });
    });
  });

  test('can execute several tasks at the same time', async () => {
    const fn = vi.fn(async () => wait(1));
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
    const successfulTask = vi.fn(async () => wait(1));
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
    const successfulTask = vi.fn(async () => wait(1));
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
    const fn = vi.fn(async () => await wait(1));
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
    const successfulTasks = vi.fn(async () => wait(1));

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

    // 20 regular tasks and 1 failing task.
    expect(taskQueue.totalTasks).toBe(21);

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
    const fn = vi.fn(async () => wait(1));
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
    const fn = vi.fn(async () => wait(1));
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
    const fn = vi.fn(async () => wait(1));
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

  test('Removes callbacks set on startExecution when restarted', async () => {
    const fn = vi.fn(async () => wait(1));
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const callback = vi.fn();
    taskQueue.startExecution({
      onWorkersIdle: () => {
        callback();
      },
    });

    await taskQueue.waitForIdle();

    const fn2 = vi.fn(async () => wait(1));
    const moreTasks = Array.from({ length: 20 }, () => fn2);
    taskQueue.addTasks(moreTasks);

    taskQueue.startExecution();

    await taskQueue.waitForIdle();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(20);
    expect(fn2).toHaveBeenCalledTimes(20);
  });

  test('the queue can be cleared', async () => {
    const fn = vi.fn(async () => wait(1));
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

  test('on success callbacks provided will get called', async () => {
    const fn = vi.fn(async () => wait(1));
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const callBack = vi.fn();
    await new Promise<void>((res) => {
      taskQueue.startExecution({
        onWorkersIdle() {
          callBack();
          res();
        },
      });
    });

    expect(callBack).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('on task error callbacks provided will get called', async () => {
    let i = 0;
    const fn = vi.fn(async () => {
      i++;

      // Random number
      if (i === 5) {
        throw new Error('Error');
      }

      new Promise<void>((res) => {
        setTimeout(() => {
          res();
        }, 10);
      });
    });
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const callback = vi.fn();
    await new Promise<void>((res) => {
      taskQueue.startExecution({
        onWorkersIdle() {
          res();
        },
        onTaskError() {
          callback();
        },
      });
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('on task completed callbacks provided will get called', async () => {
    const fn = vi.fn(async () => wait(1));
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 30,
      tasks: severalTasks,
    });

    const callback = vi.fn();
    await new Promise<void>((res) => {
      taskQueue.startExecution({
        onWorkersIdle() {
          res();
        },
        onTaskCompleted() {
          callback();
        },
      });
    });

    expect(callback).toHaveBeenCalledTimes(20);
    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('Does nothing extra if startExecution is called while running', async () => {
    const fn = vi.fn(async () => wait(1));
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 2,
      tasks: severalTasks,
    });

    taskQueue.startExecution();
    await wait(3);

    expect(taskQueue.completedTasks).toBeGreaterThan(0);

    taskQueue.startExecution();

    await taskQueue.waitForIdle();

    expect(fn).toHaveBeenCalledTimes(20);
  });

  test('Callbacks can be added later', async () => {
    const fn = vi.fn(async () => wait(1));
    const severalTasks = Array.from({ length: 20 }, () => fn);

    const taskQueue = new TaskQueue({
      totalWorkers: 2,
      tasks: severalTasks,
    });

    taskQueue.startExecution();
    await wait(3);

    expect(taskQueue.completedTasks).toBeGreaterThan(0);

    const complete = vi.fn();
    taskQueue.startExecution({
      onWorkersIdle: () => complete(),
    });

    await taskQueue.waitForIdle();

    expect(fn).toHaveBeenCalledTimes(20);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  describe('waitForIdle', () => {
    test('resolves when all tasks are complete', async () => {
      const fn = vi.fn(async () => wait(1));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({
        totalWorkers: 5,
        tasks: severalTasks,
      });

      taskQueue.startExecution();

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(20);
    });

    test('resolves immediately if the queue is already idle', async () => {
      const fn = vi.fn(async () => wait(1));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({
        totalWorkers: 5,
        tasks: severalTasks,
      });

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(0);
    });

    test('does not throw if any task fails', async () => {
      const errFn = vi.fn(async () => {
        throw new Error('Task failed');
      });
      const fn = vi.fn(async () => wait(1));
      const severalTasks = [];
      severalTasks.push(...Array.from({ length: 10 }, () => fn));
      severalTasks.push(errFn);
      severalTasks.push(...Array.from({ length: 10 }, () => fn));

      const taskQueue = new TaskQueue({
        totalWorkers: 5,
        tasks: severalTasks,
      });

      taskQueue.startExecution();

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalled();
      expect(errFn).toHaveBeenCalledTimes(1);
    });
  });
});
