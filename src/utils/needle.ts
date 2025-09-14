type TaskType = () => Promise<unknown> | (() => unknown);

function isUndefinedOrNull(value: unknown): value is undefined | null {
  return value === undefined || value === null;
}

interface TaskQueueConstructorInput {
  totalWorkers?: number;
  tasks: TaskType[];
}

const ALL_WORKERS_IDLE_EVENT = 'all_workers_idle';
const TASK_ERROR_EVENT = 'task_error';
const TASK_COMPLETED_EVENT = 'TaskCompletedEvent';

// TODO modify the custom event to include the error object
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

// TODO modify the custom event to include metrics
export class TaskQueueCompletedEvent extends Event {
  private _successfulTasks: number;
  private _failedTasks: number;

  constructor(args: { successfulTasks: number; failedTasks: number }) {
    super(ALL_WORKERS_IDLE_EVENT);
    this._successfulTasks = args.successfulTasks;
    this._failedTasks = args.failedTasks;
  }

  get successfulTasks(): number {
    return this._successfulTasks;
  }

  get failedTasks(): number {
    return this._failedTasks;
  }
}

/**
 * A task queue to manage and execute asynchronous tasks in sequence.
 * Should allow for more jobs than workers, and queue them up to be executed
 * as workers become available.
 */
export class TaskQueue extends EventTarget {
  private tasks: TaskType[] = [];

  private completeTasks: TaskType[] = [];
  private failedTasks: { task: TaskType; error: unknown }[] = [];
  private totalWorkers: number = 30;

  private workers: Record<string, TaskType | null> = {};

  constructor(args: TaskQueueConstructorInput) {
    super();

    const { totalWorkers, tasks } = args;

    // Check > 0
    if (!isUndefinedOrNull(totalWorkers) && totalWorkers > 0) {
      // Coerce to an integer
      this.totalWorkers = Math.trunc(totalWorkers);
    }

    // Initialize the task array
    if (!isUndefinedOrNull(tasks)) {
      this.tasks = tasks;
    }

    // initialize the worker object
    const workArr = Array.from({ length: this.totalWorkers }, (_, i) => i);
    for (const workerId of workArr) {
      this.workers[workerId] = null;
    }
  }

  /**
   * Adds a task or array of tasks to the queue. Each task is a function
   * or asynchronous function.
   * @param task A single task or an array of tasks to add to the queue
   */
  addTasks(task: TaskType | TaskType[]): void {
    if (Array.isArray(task)) {
      this.tasks.push(...task);
    } else {
      this.tasks.push(task);
    }
  }

  /**
   * Starts executing tasks in the queue. Resolves when all tasks are complete.
   */
  startExecution(): void {
    for (const workerId of Object.keys(this.workers)) {
      const task = this.getNextTask();
      if (task) {
        this.runTask(workerId, task);
      } else {
      }
    }
  }

  /**
   * Slice off the next task in the queue
   */
  private getNextTask(): TaskType | undefined {
    return this.tasks.shift();
  }

  /**
   * Runs the task on the specified worker index.
   * On completion, attempts to get the next task and run it.
   * If no next task, marks the worker as idle. Waits until all workers are idle
   * to dispatch the 'all_workers_idle' event.
   */
  private async runTask(index: string | number, task: TaskType): Promise<void> {
    this.workers[index] = task;

    try {
      // Start Task
      await task();

      this.completeTasks.push(task);

      // On Completion, dispatch a completed event
      this.dispatchEvent(new TaskCompletedEvent());
    } catch (e) {
      // TODO pass the error object with the event

      this.failedTasks.push({ task, error: e });
      this.dispatchEvent(new TaskQueueErrorEvent(e));
    }

    // Mark worker as free
    this.workers[index] = null;

    // Get the next task
    const nextTask = this.getNextTask();

    // If there is a next task, run it
    if (nextTask) {
      this.runTask(index, nextTask);
    } else {
      // If no next task, check if all workers are idle
      if (this.allWorkersIdle()) {
        // TODO add metrics to the event
        this.dispatchEvent(
          new TaskQueueCompletedEvent({
            successfulTasks: this.completeTasks.length,
            failedTasks: this.failedTasks.length,
          }),
        );

        this.completeTasks = [];
        this.failedTasks = [];
      }
      // Otherwise, do nothing and wait for other workers to finish
    }
  }

  private allWorkersIdle(): boolean {
    return Object.values(this.workers).every(isUndefinedOrNull);
  }

  static ALL_WORKERS_IDLE = ALL_WORKERS_IDLE_EVENT;
  static TASK_ERROR = TASK_ERROR_EVENT;
  static TASK_COMPLETED = TASK_COMPLETED_EVENT;
}

interface RunTaskWorkersInput {
  totalWorkers?: number;
  tasks: TaskType[];
}

/**
 * Convenience function to run a set of tasks with a specified number of workers.
 */
export async function runTaskWorkers(args: RunTaskWorkersInput) {
  const { totalWorkers, tasks } = args;

  const taskQueue = new TaskQueue({
    totalWorkers,
    tasks,
  });

  return new Promise<void>((res, rej) => {
    taskQueue.startExecution();
    taskQueue.addEventListener('all_workers_idle', () => {
      res();
    });
    taskQueue.addEventListener('Errored_task', (ev) => {
      rej(ev);
    });
  });
}
