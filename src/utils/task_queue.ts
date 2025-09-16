type TaskType = () => Promise<unknown> | (() => unknown);

function isUndefinedOrNull(value: unknown): value is undefined | null {
  return value === undefined || value === null;
}

export interface TaskQueueConstructorInput {
  totalWorkers?: number;
  tasks?: TaskType[];
  retries?: number;
}

const ALL_WORKERS_IDLE_EVENT = 'all_workers_idle';
const TASK_ERROR_EVENT = 'task_error';
const TASK_COMPLETED_EVENT = 'TaskCompletedEvent';

export class TaskQueueErrorEvent extends Event {
  private _error: unknown;
  constructor(error: unknown) {
    super(TASK_ERROR_EVENT);
    this._error = error;
  }

  get error(): unknown {
    return this._error;
  }
}

export class TaskCompletedEvent extends Event {
  constructor() {
    super(TASK_COMPLETED_EVENT);
  }
}

export class TaskQueueCompletedEvent extends Event {
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

interface QueuedTask {
  task: TaskType;
  attempts: number;
  failures: TaskQueueErrorEvent[];
}

// TODOs:
// - Add getters that return metrics about the queue
//   - Total tasks
//   - Successful tasks
//   - Failed tasks
//   - Pending tasks
//   - Active tasks
//   - Idle workers
//   - Currently running tasks
// - Add ability to pause the queue
// - Add ability to stop the queue
// - Add a timeout to tasks
// - Add retries
// - Add retry delay
// - Provide a way to force retry a failed task from the TASK_ERROR event

/**
 * A task queue to manage and execute asynchronous tasks in sequence.
 * Should allow for more jobs than workers, and queue them up to be executed
 * as workers become available.
 */
export class TaskQueue extends EventTarget {
  private tasks: QueuedTask[] = [];

  private totalUniqueTasksAdded: number = 0;

  private _completeTasks: QueuedTask[] = [];
  private _failedTasks: { task: QueuedTask; error: unknown }[] = [];
  private _totalWorkers: number = 30;

  private workers: Record<string, QueuedTask | null> = {};
  private retries: number = 0;

  private continueRunning = true;

  constructor(args: TaskQueueConstructorInput) {
    super();

    const { totalWorkers, tasks, retries } = args;

    this.retries = retries ?? 0;

    // Check > 0
    if (!isUndefinedOrNull(totalWorkers) && totalWorkers > 0) {
      // Coerce to an integer
      this._totalWorkers = Math.trunc(totalWorkers);
    }

    // Initialize the task array
    const toAdd = Array.isArray(tasks) ? tasks : [];
    this.addTasks(toAdd);

    // initialize the worker object
    const workArr = Array.from({ length: this._totalWorkers }, (_, i) => i);
    for (const workerId of workArr) {
      this.workers[workerId] = null;
    }
  }

  get pendingTasks(): number {
    return this.tasks.length;
  }
  get completedTasks(): number {
    return this._completeTasks.length;
  }
  get failedTasks(): number {
    return this._failedTasks.length;
  }
  get totalWorkers(): number {
    return this._totalWorkers;
  }
  get totalTasks(): number {
    return this.totalUniqueTasksAdded;
  }

  private addTask(task: TaskType): void {
    this.totalUniqueTasksAdded += 1;
    this.tasks.push({ task, attempts: 0, failures: [] });
  }

  /**
   * Adds a task or array of tasks to the queue. Each task is a function
   * or asynchronous function.
   * @param task A single task or an array of tasks to add to the queue
   */
  addTasks(task: TaskType | TaskType[]): void {
    const toAdd = Array.isArray(task) ? task : [task];
    for (const t of toAdd) {
      this.addTask(t);
    }
  }

  /**
   * Starts executing tasks in the queue. Resolves when all tasks are complete.
   */
  startExecution(): void {
    this.continueRunning = true;

    for (const workerId of Object.keys(this.workers)) {
      const task = this.getNextTask();
      if (task) {
        this.runTask(workerId, task);
      }
    }

    if (this.allWorkersIdle()) {
      this.sendAllDone();
    }
  }

  private eventListeners: Record<string, EventListenerOrEventListenerObject[]> =
    {};

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    super.addEventListener(type, callback, options);

    if (callback) {
      const evs = this.eventListeners[type] ?? [];
      evs.push(callback);
      this.eventListeners[type] = evs;
    }
  }

  clearEventListeners() {
    for (const [type, listeners] of Object.entries(this.eventListeners)) {
      for (const listener of listeners) {
        super.removeEventListener(type, listener);
      }
    }
    this.eventListeners = {};
  }

  /**
   * Stops the queue after the currently running tasks complete.
   * Most Promises cannot be cancelled, so this will not stop
   * currently running tasks.
   */
  stop(): void {
    this.continueRunning = false;
  }

  clearQueue() {
    if (!this.allWorkersIdle()) {
      throw new Error('Cannot clear the queue while tasks are running');
    }
    this.tasks = [];
    this.totalUniqueTasksAdded = 0;
    this._completeTasks = [];
    this._failedTasks = [];
  }

  /**
   * Slice off the next task in the queue
   */
  private getNextTask(): QueuedTask | undefined {
    return this.tasks.shift();
  }

  /**
   * Runs the task on the specified worker index.
   * On completion, attempts to get the next task and run it.
   * If no next task, marks the worker as idle. Waits until all workers are idle
   * to dispatch the 'all_workers_idle' event.
   */
  private async runTask(
    index: string | number,
    queuedTask: QueuedTask,
  ): Promise<void> {
    this.workers[index] = queuedTask;

    try {
      queuedTask.attempts += 1;
      // Start Task
      await queuedTask.task();

      this._completeTasks.push(queuedTask);

      // On Completion, dispatch a completed event
      this.dispatchEvent(new TaskCompletedEvent());
    } catch (e) {
      // TODO pass the error object with the event

      queuedTask.failures.push(new TaskQueueErrorEvent(e));
      this._failedTasks.push({ task: queuedTask, error: e });
      this.dispatchEvent(new TaskQueueErrorEvent(e));

      if (this.retries && queuedTask.attempts <= this.retries) {
        this.tasks.push(queuedTask);
      }
    }

    // Mark worker as free
    this.workers[index] = null;

    if (!this.continueRunning) {
      if (this.allWorkersIdle()) {
        this.sendAllDone();
      }
      // If we are not continuing, we're going to stop here
      return;
    }

    // Get the next task
    const nextTask = this.getNextTask();

    // If there is a next task, run it
    if (nextTask) {
      this.runTask(index, nextTask);
    } else {
      // If no next task, check if all workers are idle
      if (this.allWorkersIdle()) {
        // TODO add metrics to the event
        this.sendAllDone();
      }
      // Otherwise, do nothing and wait for other workers to finish
    }
  }

  private sendAllDone() {
    this.dispatchEvent(
      new TaskQueueCompletedEvent({
        successfulTasks: this._completeTasks.length,
        failedTasks: this._failedTasks.length,
        totalTasks: this.totalUniqueTasksAdded,
      }),
    );
  }

  private allWorkersIdle(): boolean {
    return Object.values(this.workers).every(isUndefinedOrNull);
  }

  static ALL_WORKERS_IDLE = ALL_WORKERS_IDLE_EVENT;
  static TASK_ERROR = TASK_ERROR_EVENT;
  static TASK_COMPLETED = TASK_COMPLETED_EVENT;
}

export interface RunTaskQueueArgs extends TaskQueueConstructorInput {
  onSuccess?: () => void | Promise<void>;
  onTaskError?: (error: unknown) => void | Promise<void>;
  onTaskCompleted?: () => void | Promise<void>;
}

/**
 * Convenience function to run a task queue without needing to
 * set up all of the event listeners manually.
 */
export async function runTaskQueue(args: RunTaskQueueArgs) {
  const taskQueue = new TaskQueue({
    totalWorkers: args.totalWorkers ?? 30,
    tasks: args.tasks,
  });

  return new Promise<void>((res) => {
    taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
      args?.onSuccess?.();
      res();
    });
    taskQueue.addEventListener(TaskQueue.TASK_COMPLETED, () => {
      args?.onTaskCompleted?.();
    });
    taskQueue.addEventListener(TaskQueue.TASK_ERROR, (ev) => {
      args?.onTaskError?.(ev);
    });
    taskQueue.startExecution();
  });
}
