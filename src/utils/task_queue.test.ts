import { TaskQueue } from './task_queue';
import { wait } from './wait';

describe('TaskQueue', () => {
  describe('Running multiple tasks', () => {
    test('should run all tasks and emit the completed event', async () => {
      const fn = vi.fn();
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks);

      await new Promise((resolve) => {
        taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
          expect(fn).toHaveBeenCalledTimes(20);
          resolve(null);
        });
      });

      expect(fn).toHaveBeenCalledTimes(20);
    });

    test('async events should run almost near parallel', async () => {
      const fn = vi.fn(() => wait(20));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 20 });

      taskQueue.addTask(severalTasks);

      const start = performance.now();
      await new Promise((resolve) => {
        taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
          expect(fn).toHaveBeenCalledTimes(20);
          resolve(null);
        });
      });
      const end = performance.now();

      // 20 workers working at the same time, running 20 tasks that all take
      // 20ms. Should take just a little more than 20ms, but not much more.
      expect(end - start).toBeLessThan(22);

      expect(fn).toHaveBeenCalledTimes(20);
    });

    test('sends an all done event even if all tasks fail', async () => {
      const fn = vi.fn(() => Promise.reject(new Error('Task failed')));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks);

      const result = await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(20);
      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(0);

      expect(result.successfulTasks).toBe(0);
      expect(result.failedTasks).toBe(20);
    });

    describe('errors', () => {
      test('sends an error event when a task fails', async () => {
        const err = new Error('Task failed');
        const fn = vi.fn(() => Promise.reject(err));
        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        const errHandler = vi.fn((ev) => {
          expect(ev.toString()).toBe(`TaskQueueErrorEvent: ${err}`);
        });
        taskQueue.addEventListener(TaskQueue.TASK_ERROR, errHandler);

        taskQueue.addTask(fn);

        await taskQueue.waitForIdle();

        expect(errHandler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('retries', () => {
    test('on failure, a task will retry again', async () => {
      function* partialRejection() {
        yield Promise.reject(new Error('Task failed'));
        yield Promise.resolve();
      }
      const gen = partialRejection();
      const fn = vi.fn(() => gen.next().value);

      const taskQueue = new TaskQueue({ totalWorkers: 5, retries: 1 });

      taskQueue.addTask(fn);

      const result = await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(2);
      expect(result.successfulTasks).toBe(1);
      expect(result.failedTasks).toBe(0);
    });

    test('retries the task up to the specified number of retries', async () => {
      const fn = vi.fn(() => Promise.reject('Task failed'));

      const taskQueue = new TaskQueue({ totalWorkers: 5, retries: 3 });
      taskQueue.addTask(fn);

      const result = await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(4);
      expect(result.successfulTasks).toBe(0);
      expect(result.failedTasks).toBe(1);
    });

    test('runs a task only once if retries is set to 0', async () => {
      const fn = vi.fn(() => Promise.reject(new Error('Task failed')));

      const taskQueue = new TaskQueue({ totalWorkers: 5, retries: 0 });

      taskQueue.addTask(fn);

      const result = await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.successfulTasks).toBe(0);
      expect(result.failedTasks).toBe(1);
    });

    test('pushes the failed task back to the queue if it has retries left', async () => {
      let i = 0;

      function* partialRejection() {
        yield Promise.reject(new Error('Task failed'));
        yield Promise.resolve();
      }
      const gen = partialRejection();

      // This task will fail the first time, then get retries and get pushed to the end of
      // the queue. The second time gen.next().value is called, its value will be a resolved
      // promise and succeed. By then, the other 20 tasks in the queue will have been processed
      const failingFn = vi.fn(async () => {
        try {
          const _value = await gen.next().value;
          // Second time
          expect(i).toBe(20);
        } catch (e) {
          // First time
          expect(i).toBe(0);
          throw e;
        }
      });

      const fn = vi.fn(() => ++i);
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5, retries: 1 });

      taskQueue.addTask(failingFn);
      taskQueue.addTask(severalTasks);
    });
  });

  describe('getters', () => {
    describe('isIdle', () => {
      test('returns true if all tasks are completed and there are no pending tasks', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 20 });

        taskQueue.addTask(severalTasks);

        await taskQueue.waitForIdle();

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.pendingTasks).toBe(0);
        expect(taskQueue.tasksRunning).toBe(0);
      });

      test('returns false if there are pending tasks', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 20 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.tasksRunning > 0).toBe(true);

        await taskQueue.waitForIdle();
      });

      test('returns false if there are active workers', async () => {});
    });

    describe('pendingTasks', () => {
      test('returns the number of pending tasks', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 20 });

        taskQueue.addTask(severalTasks, { runImmediately: false });

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.pendingTasks).toBe(severalTasks.length);
        expect(taskQueue.tasksRunning).toBe(0);
      });

      test('returns the number of pending tasks while some tasks are running', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.pendingTasks).toBe(15);
        expect(taskQueue.tasksRunning > 0).toBe(true);

        await taskQueue.waitForIdle();
      });

      test('returns zero if there are no pending tasks', () => {
        const taskQueue = new TaskQueue({ totalWorkers: 20 });

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.pendingTasks).toBe(0);
        expect(taskQueue.tasksRunning).toBe(0);
      });

      test('returns zero if all pending tasks are completed', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 20 });

        taskQueue.addTask(severalTasks);

        await taskQueue.waitForIdle();

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.pendingTasks).toBe(0);
        expect(taskQueue.tasksRunning).toBe(0);
      });
    });

    describe('tasksRunning', () => {
      test('returns the number of active workers', () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.tasksRunning).toBe(5);
      });

      test('returns zero if there are no active workers', () => {
        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.tasksRunning).toBe(0);
      });

      test('returns zero when all workers have completed their tasks', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        taskQueue.addTask(severalTasks);

        await taskQueue.waitForIdle();

        expect(taskQueue.isIdle).toBe(true);
        expect(taskQueue.tasksRunning).toBe(0);
      });
    });

    describe('totalWorkers', () => {
      test('returns the total number of workers', () => {
        const taskQueue = new TaskQueue({ totalWorkers: 10 });
        expect(taskQueue.totalWorkers).toBe(10);
      });

      test('allows setting the total number of workers', () => {
        const taskQueue = new TaskQueue({ totalWorkers: 5 });
        expect(taskQueue.totalWorkers).toBe(5);

        taskQueue.totalWorkers = 10;
        expect(taskQueue.totalWorkers).toBe(10);
      });

      test('starts running more tasks if totalWorkers is increased and there are pending tasks', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.tasksRunning).toBe(5);
        expect(taskQueue.pendingTasks).toBe(15);

        taskQueue.totalWorkers = 10;

        expect(taskQueue.tasksRunning).toBe(10);
        expect(taskQueue.pendingTasks).toBe(10);

        await taskQueue.waitForIdle();

        expect(fn).toHaveBeenCalledTimes(20);
      });

      test('does not start running more tasks if totalWorkers is increased but there are no pending tasks', async () => {
        const tq = new TaskQueue({ totalWorkers: 5 });
        expect(tq.totalWorkers).toBe(5);

        tq.totalWorkers = 10;
        expect(tq.totalWorkers).toBe(10);
        expect(tq.tasksRunning).toBe(0);
      });

      test('does not start running more tasks if totalWorkers is increased but the queue is stopped', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);
        const taskQueue = new TaskQueue({ totalWorkers: 5 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.tasksRunning).toBe(5);
        expect(taskQueue.pendingTasks).toBe(15);

        taskQueue.stop();

        taskQueue.totalWorkers = 10;
        expect(taskQueue.tasksRunning).toBe(5);

        const result = await taskQueue.waitForIdle();

        expect(taskQueue.tasksRunning).toBe(0);
        expect(taskQueue.pendingTasks).toBe(15);
        expect(result.successfulTasks).toBe(5);
      });

      test('does not start running more tasks if totalWorkers is decreased', async () => {
        const fn = vi.fn(() => wait(20));
        const severalTasks = Array.from({ length: 20 }, () => fn);

        const taskQueue = new TaskQueue({ totalWorkers: 10 });

        taskQueue.addTask(severalTasks);

        expect(taskQueue.isIdle).toBe(false);
        expect(taskQueue.tasksRunning).toBe(10);
        expect(taskQueue.pendingTasks).toBe(10);

        taskQueue.totalWorkers = 5;

        expect(taskQueue.tasksRunning).toBe(10);
        expect(taskQueue.pendingTasks).toBe(10);

        taskQueue.stop();

        await taskQueue.waitForIdle();

        taskQueue.start();

        expect(taskQueue.tasksRunning).toBe(5);
        expect(taskQueue.pendingTasks).toBe(5);

        await taskQueue.waitForIdle();

        expect(fn).toHaveBeenCalledTimes(20);
      });
    });
  });

  describe('waitForIdle', () => {
    test('resolves immediately if the queue is already idle', async () => {
      const taskQueue = new TaskQueue();

      expect(taskQueue.isIdle).toBe(true);

      const result = await taskQueue.waitForIdle();

      expect(result.successfulTasks).toBe(0);
      expect(result.failedTasks).toBe(0);
    });

    test('resolves after all tasks are completed', async () => {
      const fn = vi.fn(() => wait(20));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 20 });
      taskQueue.addTask(severalTasks);

      expect(taskQueue.isIdle).toBe(false);

      const result = await taskQueue.waitForIdle();

      expect(result.successfulTasks).toBe(20);
      expect(result.failedTasks).toBe(0);
    });

    test('resolves even if tasks fail', async () => {
      const fn = vi.fn(() => wait(20));
      const failingFn = vi.fn(() => Promise.reject(new Error('Task failed')));

      const severalTasks = Array.from({ length: 10 }, () => fn);
      severalTasks.push(failingFn);

      const taskQueue = new TaskQueue({ totalWorkers: 20 });
      taskQueue.addTask(severalTasks);

      expect(taskQueue.isIdle).toBe(false);

      const result = await taskQueue.waitForIdle();

      expect(result.successfulTasks).toBe(10);
      expect(result.failedTasks).toBe(1);
    });
  });

  describe('addTask', () => {
    test('adds a task and immediately runs the task', async () => {
      const fn = vi.fn(() => wait(20));
      const taskQueue = new TaskQueue();

      expect(taskQueue.isIdle).toBe(true);

      taskQueue.addTask(fn);

      expect(taskQueue.isIdle).toBe(false);

      await taskQueue.waitForIdle();
    });

    test('adds a task and does not immediately run the task', async () => {
      const fn = vi.fn(() => wait(20));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue();

      expect(taskQueue.isIdle).toBe(true);

      taskQueue.addTask(severalTasks, { runImmediately: false });

      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(20);
    });
  });

  describe('stop', () => {
    test('stops all workers and prevents new tasks from running', async () => {
      const fn = vi.fn();
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks);

      taskQueue.stop();

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(5);
      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(15);
    });

    test('does nothing if the queue is already stopped', async () => {
      const fn = vi.fn();
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks, { runImmediately: false });

      taskQueue.stop();

      expect(fn).not.toHaveBeenCalled();
      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(20);
    });

    test('does nothing if the queue is empty', async () => {
      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.stop();

      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(0);
    });
  });

  describe('start', () => {
    test('starts processing tasks in the queue again', async () => {
      const fn = vi.fn(() => wait(20));
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 20 });
      taskQueue.addTask(severalTasks, { runImmediately: false });

      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(20);
      expect(taskQueue.tasksRunning).toBe(0);

      taskQueue.start();

      expect(taskQueue.isIdle).toBe(false);
      expect(taskQueue.pendingTasks).toBe(0);
      expect(taskQueue.tasksRunning).toBe(20);

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(20);
    });

    test('does nothing if there are no tasks in the queue', () => {
      const taskQueue = new TaskQueue({ totalWorkers: 20 });

      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(0);
      expect(taskQueue.tasksRunning).toBe(0);

      taskQueue.start();

      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(0);
      expect(taskQueue.tasksRunning).toBe(0);
    });

    test('continues processing after stop is called', async () => {
      const fn = vi.fn();
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks);

      taskQueue.stop();

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(5);
      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(15);

      taskQueue.start();

      await taskQueue.waitForIdle();

      expect(fn).toHaveBeenCalledTimes(20);
      expect(taskQueue.isIdle).toBe(true);
      expect(taskQueue.pendingTasks).toBe(0);
    });
  });
});
