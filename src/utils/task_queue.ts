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
  protected _error: unknown;
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
  protected _successfulTasks: number;
  protected _failedTasks: number;
  protected _totalTasks: number;

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

/**
 * Used to differentiate abort errors from other errors
 */
class AbortError extends Error {}

/**
 * Object bundle that holds a task (a function) and metadata
 * about the task, including number of attempts and any errors
 * that have occurred.
 */
interface QueuedTask {
  task: TaskType;
  attempts: number;
  failures: TaskQueueErrorEvent[];
}

/**
 * A helper class to run a task with an abort signal.
 * This allows us to abort tasks that are currently running
 * when the queue is stopped. The AbortSignal should come from
 * the TaskQueue's AbortController.
 */
class TaskRunner {
  constructor(
    protected queuedTask: QueuedTask,
    protected signal: AbortSignal,
  ) {}

  /**
   * This function runs an async task. If it succeeds, it resolves.
   * If it fails, it rejects. If the abort signal is triggered,
   * it rejects with an AbortError.
   */
  run() {
    return new Promise<void>(async (res, rej) => {
      // We create a reference to the abort callback. This allows
      // us to remove the event listener later.
      const abortCallBack = () => {
        rej(new AbortError('Task aborted'));
      };
      this.signal.addEventListener('abort', abortCallBack, { once: true });

      try {
        await this.queuedTask.task();
        this.signal.removeEventListener('abort', abortCallBack);

        // We aren't worried about resolving with a value because
        // these tasks are just fire-and-forget.
        res();
      } catch (e) {
        this.signal.removeEventListener('abort', abortCallBack);
        rej(e);
      }
    });
  }

  /**
   * Convenience static method to run a task as a one-liner.
   */
  static runTask(queuedTask: QueuedTask, signal: AbortSignal): Promise<void> {
    const runner = new TaskRunner(queuedTask, signal);
    return runner.run();
  }
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
  /**
   * All queued tasks that have not yet started. When tasks get
   * started, they are removed from this array.
   */
  protected tasks: QueuedTask[] = [];

  /**
   * Total unique tasks that have been added to the queue. This
   * counter allows us to track the total number of tasks because
   * tasks gets emptied as tasks are run.
   */
  protected totalUniqueTasksAdded: number = 0;

  /**
   * List of Completed tasks that have successfully run.
   */
  protected _completeTasks: QueuedTask[] = [];

  /**
   * Failed tasks. This number can be greater than the total number
   * of unique tasks if retries are used. A task can fail multiple times.
   */
  protected _failedTasks: { task: QueuedTask; error: unknown }[] = [];

  /**
   * Total number of workers that can run concurrently. Default is 30.
   * Must be > 0. This number should be tuned to fit the environment
   * and the type of tasks being run.
   */
  protected _totalWorkers: number = 30;

  /**
   * The workers and the task they are currently running. If a
   * worker is idle, the value is null.
   */
  protected workers: Record<string, QueuedTask | null> = {};

  /**
   * The number of retries a single task can attempt before being marked
   * as failed. Default is 0 (no retries).
   */
  protected retries: number = 0;

  /**
   * Abort controller created by the TaskQueue to abort running
   * tasks. An AbortSignal from this controller is passed to each
   * task when it is run.
   */
  protected abortController = new AbortController();

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

  /**
   * Adds a single task to the queue.
   */
  protected addTask(task: TaskType): void {
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
   * Slice off the next task in the queue
   */
  protected getNextTask(): QueuedTask | undefined {
    return this.tasks.shift();
  }

  /**
   * Runs the task on the specified worker index.
   * On completion, attempts to get the next task and run it.
   * If no next task, marks the worker as idle. Waits until all workers are idle
   * to dispatch the 'all_workers_idle' event.
   */
  protected async runTask(index: string | number): Promise<void> {
    // Get the next task
    const queuedTask = this.getNextTask();

    if (!queuedTask) {
      // No task to run, the array must be empty. If the workers
      // are all idle, send the all done event
      if (this.allWorkersIdle()) {
        this.sendAllDone();
      }

      return;
    }

    this.workers[index] = queuedTask;

    try {
      queuedTask.attempts += 1;
      // Start Task
      await TaskRunner.runTask(queuedTask, this.abortController.signal);

      this._completeTasks.push(queuedTask);

      // On Completion, dispatch a completed event
      this.dispatchEvent(new TaskCompletedEvent());
    } catch (e) {
      if (e instanceof AbortError) {
        // Task was aborted, we need to set this worker
        // as idle and check for all done
        this.setWorkerFinished(index);

        if (this.allWorkersIdle()) {
          this.sendAllDone();
        }

        return;
      }
      // TODO pass the error object with the event

      queuedTask.failures.push(new TaskQueueErrorEvent(e));
      this._failedTasks.push({ task: queuedTask, error: e });
      this.dispatchEvent(new TaskQueueErrorEvent(e));

      if (this.retries && queuedTask.attempts <= this.retries) {
        this.tasks.push(queuedTask);
      }
    }

    // Mark worker as free
    this.setWorkerFinished(index);

    // Start over
    this.runTask(index);
  }

  /**
   * Marks the worker as finished by setting its task to null.
   */
  protected setWorkerFinished(index: string | number) {
    this.workers[index] = null;
  }

  /**
   * Starts executing tasks in the queue. Resolves when all tasks are complete.
   */
  startExecution(): void {
    for (const workerId of Object.keys(this.workers)) {
      this.runTask(workerId);
    }

    if (this.allWorkersIdle()) {
      this.sendAllDone();
    }
  }

  /**
   * All event listeners get added to this object so that when
   * we want to remove them all, we have references to them.
   */
  protected eventListeners: Record<
    string,
    EventListenerOrEventListenerObject[]
  > = {};

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

  /**
   * Removes all event listeners added to the TaskQueue instance.
   */
  clearAllEventListeners() {
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
   * functions that are currently running. However, it will
   * immediately reject all promises currently running with an
   * AbortError.
   */
  stop(): void {
    this.abortController.abort();
  }

  /**
   * Clears all pending tasks in the queue. Will throw an error
   * if tasks are currently running.
   */
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
   * Sends a TaskQueueCompletedEvent, which is an all done event
   * with metrics about the run.
   */
  protected sendAllDone() {
    this.dispatchEvent(
      new TaskQueueCompletedEvent({
        successfulTasks: this._completeTasks.length,
        failedTasks: this._failedTasks.length,
        totalTasks: this.totalUniqueTasksAdded,
      }),
    );
  }

  /**
   * Checks whether all workers are idle (not running a task).
   * It uses the workers object to determine this.
   */
  protected allWorkersIdle(): boolean {
    return Object.values(this.workers).every(isUndefinedOrNull);
  }

  static ALL_WORKERS_IDLE = ALL_WORKERS_IDLE_EVENT;
  static TASK_ERROR = TASK_ERROR_EVENT;
  static TASK_COMPLETED = TASK_COMPLETED_EVENT;
}

export interface RunTaskQueueArgs extends TaskQueueConstructorInput {
  onSuccess?: (ev: TaskQueueCompletedEvent) => void | Promise<void>;
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

  return new Promise<TaskQueueCompletedEvent>((res) => {
    taskQueue.addEventListener(TaskQueue.ALL_WORKERS_IDLE, (ev) => {
      const evToSend =
        ev instanceof TaskQueueCompletedEvent
          ? ev
          : new TaskQueueCompletedEvent({
              successfulTasks: taskQueue.completedTasks,
              failedTasks: taskQueue.failedTasks,
              totalTasks: taskQueue.totalTasks,
            });
      args?.onSuccess?.(evToSend);

      res(evToSend);
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
