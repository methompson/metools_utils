/**
 * New Task Queue
 *
 * Requirements:
 *
 * Able to control amount of requests being processed at the same time
 * Able to start & stop the queue
 * Able to add tasks individually or in bulk
 * Able to start the queue when adding or after adding tasks
 * Able to retry failed tasks a specified number of times
 * Able to emit events for task completion, failure, and retries
 * Able to ignore failure events
 */

const ALL_WORKERS_IDLE_EVENT = 'all_workers_idle';
const TASK_ERROR_EVENT = 'task_error';
const TASK_COMPLETED_EVENT = 'task_completed_event';

export type Task<T> = () => T | Promise<T>;

interface QueuedTask {
  task: Task<unknown>;
  attempts: number;
  failures: unknown[];
}

class TaskQueueCompletedEvent extends Event {
  private _successfulTasks: number;
  private _failedTasks: number;
  private _totalTasks: number;

  constructor(args: {
    successfulTasks: number;
    failedTasks: number;
    totalTasks: number;
  }) {
    super(ALL_WORKERS_IDLE_EVENT);
    this._successfulTasks = args.successfulTasks;
    this._failedTasks = args.failedTasks;
    this._totalTasks = args.totalTasks;
  }

  get successfulTasks(): number {
    return this._successfulTasks;
  }
  get failedTasks(): number {
    return this._failedTasks;
  }
  get totalTasks(): number {
    return this._totalTasks;
  }
}

class TaskQueueErrorEvent extends Event {
  private _error: string;

  constructor(error: string) {
    super(TASK_ERROR_EVENT);
    this._error = error;
  }

  get error(): unknown {
    return this._error;
  }

  toString() {
    return `TaskQueueErrorEvent: ${this._error}`;
  }
}

interface TaskQueueArgs {
  totalWorkers?: number;
  tasks?: Task<unknown>[];
  runImmediately?: boolean;
  retries?: number;
}

interface AddTaskArgs {
  runImmediately?: boolean;
}

/**
 * The Task Queue runs an arbitrary quantity of functions with
 * a specific number of workers at the same time. The queue will
 * can run immediately when a task is added or wait until a start
 * method is called. All tasks must be a function with no arguments
 * a no return values. Any work that must be done to a resource
 * outside of its purview should be performed within a closure.
 */
export class TaskQueue extends EventTarget {
  /**
   * Total workers at once
   */
  private _totalWorkers: number;

  /**
   * Flag to determine if the queue is stopped or not.
   */
  private _isStopped: boolean = false;

  /**
   * Number of times to retry a task again. Defaults to 0.
   */
  private _retries: number = 0;

  /**
   * The Task Queue.
   */
  private _taskQueue: QueuedTask[] = [];

  /** Tasks that have been completed successfully */
  private _completedTasks: QueuedTask[] = [];

  /** Tasks that have failed, but only after all retries */
  private _failedTasks: QueuedTask[] = [];

  /**
   * The active workers currently processing tasks. The key is a
   * UUID and the value is the task function being processed.
   */
  private _workers: Record<string, QueuedTask> = {};

  constructor(args?: TaskQueueArgs) {
    super();

    const {
      totalWorkers = 5,
      tasks = [],
      runImmediately = true,
      retries = 0,
    } = args ?? {};

    this._totalWorkers = totalWorkers;
    this._taskQueue.push(
      ...tasks.map((task) => ({ task, attempts: 0, failures: [] })),
    );
    this._retries = retries;

    if (runImmediately) {
      this.runNext();
    }
  }

  private get isWorking(): boolean {
    return this.tasksRunning > 0;
  }

  private get canDoMoreWork(): boolean {
    return this.tasksRunning < this._totalWorkers;
  }

  /**
   * Returns a boolean value indicating whether the Task Queue is working or not.
   * Returns true if there are no active workers.
   */
  get isIdle(): boolean {
    return !this.isWorking;
  }

  /**
   * Returns the number of pending tasks in the queue. This does not include tasks
   * that are currently running.
   */
  get pendingTasks(): number {
    return this._taskQueue.length;
  }

  /**
   * Returns the number of active workers currently processing tasks.
   */
  get tasksRunning() {
    return Object.keys(this._workers).length;
  }

  /**
   * Adds a task to the queue. When added, a task will be processed
   * immediately and run during the normal course of the queue,
   * unless the user specifies otherwise with the `runImmediately`
   * argument.
   */
  addTask(task: Task<unknown> | Task<unknown>[], args?: AddTaskArgs) {
    const { runImmediately = true } = args ?? {};

    const tasks = Array.isArray(task) ? task : [task];

    this._taskQueue.push(
      ...tasks.map((task) => ({ task, attempts: 0, failures: [] })),
    );

    if (runImmediately) {
      this.start();
    }
  }

  /**
   * Stops any new tasks from being processed and waits for all currently
   * procsesing tasks to finish. This does not clear the queue.
   */
  stop() {
    this._isStopped = true;
  }

  /**
   * Starts processing tasks in the queue again.
   */
  start() {
    this._isStopped = false;
    this.runNext();
  }

  /**
   * This getter determines if the runNext function should run the next task or
   * halt. It returns true based on the following conditions:
   * 1. There are workers free that can do additional work (canDoMoreWork)
   * 2. There are tasks pending in the queue (pendingTasks > 0)
   * 3. The queue is not stopped (_isStopped is false)
   * If any of these conditions are not met, it returns false.
   */
  private get shouldRun(): boolean {
    return this.canDoMoreWork && this.pendingTasks > 0 && !this._isStopped;
  }

  /**
   * Attempts to run the next task in the queue. If all workers
   * are busy, it will end without doing anything. Once a function
   * is completed, this function gets called again to run the next
   * task in the queue, if there are any. If there are no tasks
   * remaining and all workers are idle, it emits the
   * 'all_workers_idle' event.
   */
  private async runNext() {
    // If there are no available workers or no tasks in the queue, do nothing
    if (!this.shouldRun) {
      // If we're idle, send the all done event
      if (this.isIdle) {
        this.sendAllDone();
      }

      return;
    }

    // Get the next task from the queue
    const nextTask = this._taskQueue.shift()!;

    // Create a unique ID for the worker
    const workerId = crypto.randomUUID();

    // Add the task to the active workers
    this._workers[workerId] = nextTask;

    // We're at a point where we've queued a task, but it hasn't run yet, so we can
    // check if we can run more tasks before we await the current one. We can fill
    // the queue up with as many tasks as we have workers.
    if (this.canDoMoreWork) {
      this.runNext();
    }

    try {
      await nextTask.task();
      this._completedTasks.push(nextTask);
    } catch (e) {
      // TODO retries
      this.sendErrorEvent(`${e}`);

      if (nextTask.attempts < this._retries) {
        nextTask.attempts++;
        nextTask.failures.push(e);
        this._taskQueue.push(nextTask);
      } else {
        this._failedTasks.push(nextTask);
      }
    } finally {
      delete this._workers[workerId];

      /**
       * Runs the next task in the queue after a task is completed,
       * even if it fails.
       */
      this.runNext();
    }
  }

  /**
   * Provides a simple async interface to wait for all workers to finish processing
   * their tasks.
   */
  async waitForIdle(): Promise<TaskQueueCompletedEvent> {
    if (this.isIdle) {
      return this.taskQueueCompletedEvent;
    }

    return await new Promise((resolve) => {
      const resolver = () => {
        this.removeEventListener(TaskQueue.ALL_WORKERS_IDLE_EVENT, resolver);
        resolve(this.taskQueueCompletedEvent);
      };

      this.addEventListener(TaskQueue.ALL_WORKERS_IDLE_EVENT, resolver);
    });
  }

  private get taskQueueCompletedEvent(): TaskQueueCompletedEvent {
    return new TaskQueueCompletedEvent({
      successfulTasks: this._completedTasks.length,
      failedTasks: this._failedTasks.length,
      totalTasks: this._completedTasks.length + this._failedTasks.length,
    });
  }

  private sendAllDone() {
    const allDoneEvent = this.taskQueueCompletedEvent;

    this.dispatchEvent(allDoneEvent);
  }

  private sendErrorEvent(err: string) {
    const errorEvent = new TaskQueueErrorEvent(err);

    this.dispatchEvent(errorEvent);
  }

  static get ALL_WORKERS_IDLE_EVENT(): string {
    return ALL_WORKERS_IDLE_EVENT;
  }
  static get TASK_ERROR_EVENT(): string {
    return TASK_ERROR_EVENT;
  }
  static get TASK_COMPLETED_EVENT(): string {
    return TASK_COMPLETED_EVENT;
  }
}
