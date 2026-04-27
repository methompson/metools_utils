import { TaskQueue } from './task_queue_b';
import { wait } from './wait';

describe('TaskQueue', () => {
  describe('Running multiple tasks', () => {
    test('should run all tasks and emit the completed event', async () => {
      const fn = vi.fn();
      const severalTasks = Array.from({ length: 20 }, () => fn);

      const taskQueue = new TaskQueue({ totalWorkers: 5 });

      taskQueue.addTask(severalTasks);

      await new Promise((resolve) => {
        taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE_EVENT, () => {
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
        taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE_EVENT, () => {
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
        taskQueue.addEventListener(TaskQueue.TASK_ERROR_EVENT, errHandler);

        taskQueue.addTask(fn);

        await taskQueue.waitForIdle();

        expect(errHandler).toHaveBeenCalledTimes(1);
      });
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
