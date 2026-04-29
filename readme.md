# @metools/utils

## Common Utilities that I use regularly.

This project contains a handful of tools I've developed in the past to help me manage my projects. My hope is that this project will continue to grow as I develop more tools that I use from project to project.

## arrayToObject

```ts
function arrayToObject <T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T>;
```

This function that can convert a JavaScript array into an object. The function accepts an array as the first argument and a keygen function as a second argument. The keygen function is what generates the key of the object that's returned.

This function is generally used to convert an arary into a hashmap. This provides a means to access individual elements from an array using a common identifier, e.g. an id.

### Example

```js
// An array of user objects
const users = await getUsers();

const userMap = arrayToObject(
  users,
  (user) => user.id, // A string in the user object
);

const someUserId = 'my fun user id';

// Gets the user right away
const myUser = userMap[someUserId];

// Similar to the following.
// If you use the below more than a couple times, arrayToObject is more performant.
const myUserSlow = users.find((user) => user.id === someUserId);
```

## arrayToGroup

```ts
function arrayToGroup <T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T[]>;
```

This function is used to go through a list and group elements together by a common value. The end result is an object where the key is the said common value, and the value is an array of values that have that common value.

For example, you may have an array of transactions and you'd like to group these transactions together based upon who initiated the transaction, i.e. a user Id. The end result would be an object, where the keys are user Ids and the values are arrays of transactions.

### Example

```js
// A list of transactions
const transactions = await getTransactions();

const transactionsByUser = arrayToGroup(
  transactions,
  (tx) => tx.userId, // A string in the tx object
);

const someUserId = 'my fun user id';

// Gets all user transactions
const userTxs = transactionsByUser[someUserId];

// Similar to the following.
// If you attempt to get transactions by user more than a couple times, arrayToGroup is more performant.
const userTxsSlow = transactions.filter((tx) => tx.userId === someUserId);
```

## mappedArrayToObject

```ts
function mappedArrayToObject <T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U>;
```

This function combines `arrayToObject` with something similar to `Array.prototype.map`. The function performs a transform on each element, dictated by the `valuegen` argument and assigns the value to the key dictated by the `keygen` argument. This function allows users to transform their inputs rather than having to iterate over the array multiple times.

### Example

```js
// An array of user objects
const users = await getUsers();

// Object with user id as key and user name as value
const nameMap = mappedArrayToObject(
  users,
  (u) => u.id,
  (u) => u.name,
);

// Object with simplified object as the value
const miniUserMap = mappedArrayToObject(
  users,
  (u) => u.id,
  (u) => ({id: u.id, name: u.name, u.address}),
);

// Get transactions and sort them by user ID
const transactions = await getTransactions();
const txMap = arrayToGroup(transactions, (tx) => tx.userId);

// Combine the transactions and user values together
const userTransactions = mappedArrayToObject(
  users,
  (u) => u.id,
  (u) => {
    const userTxs = txMap[u.id] ?? [];
    return {
      id: u.id,
      transactions: userTxs,
    };
  },
);
```

## mappedArrayToGroup

```ts
function mappedArrayToGroup <T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U[]>;
```

This function combines `arrayToGroup` and `mappedArrayToObject` together to let you group similar items together, while simultaneously transforming the values together as well. This lets you do things like group objects together by some common element (e.g. a user ID or maybe address state), while also making transforms on the data for easier use.

For instance, you may want to transform the data into something simple for export as a JSON string or to send to an API without having to add a ton of extra data.

### Example

```js
// Returns an array of complciated transaction objects
const userTransactions = await getUserTransactions();

// This returns an object with the user ID as the key, and an array of simplified object as the value.
const simpleTransactions = mappedArrayToGroup(
  userTransactions,
  (tx) => tx.userId,
  (tx) => ({
    id: tx.id,
    userId: tx.userId,
    total: tx.total,
    date: tx.date,
  }),
);
```

## toPlainObject

```ts
function toPlainObject (data: unknown): unknown;
```

`toPlainObject` is a debugging utility meant to convert potentially complicated objects into simple objects for debugging purposes. This function is not meant for production use. There are some situations where values in use may be difficult to discern, especially with proxied values. This function just serializes, then deserializes into a plain JS object or array so that the values are easier to interpret when debugging functions.

```js
// A complicated class with getters, proxied values and other things that make it difficult to debug
const val = new ComplicatedClass();

// Now a plain JS Object
const plainVal = toPlainObject(val);

// An array of complicated objects
const manyComplicatedValues = getComplicatedValues();

// Now an array of plain JS objects
const simplifiedValues = toPlainObject(manyComplicatedValues);
```

## split

```ts
function split <T>(
  arr: T[],
  filterOp: (value: T, index: number, array: T[]) => unknown,
): [T[], T[]]
```

The split function operates similarly to the `Array.prototype.filter` function, but instead of just returning the values that pass the filter test, it returns both values that match and those that don't match as two elements in an array.

The first returned value are all results that match and the second returned value are all results that don't match the filter function.

### Example

```ts
const arr = [1, 'two', 3, 'four', 5, true, null, {}, []];

// pass should be [1, 3, 5]
// fail should be ['two', 'four', true, null, {}, []]
const [pass, fail] = split(arr, (el) => typeof el === 'number');
```

## TaskQueue

```ts
type Task<T> = () => T | Promise<T>;

interface TaskQueueArgs {
  totalWorkers?: number;
  tasks?: Task<unknown>[];
  runImmediately?: boolean;
  retries?: number;
}

interface AddTaskArgs {
  runImmediately?: boolean;
}

class TaskQueue extends EventTarget;

constructor TaskQueue(args: TaskQueueArgs): TaskQueue;

// Methods
// Adds more tasks. Can be run while tasks are executing to add more tasks
TaskQueue.addTask(task: Task<unknown> | Task<unknown>[], args?: AddTaskArgs): void
// Stops executing the tasks. Tasks that are currently running will finish.
TaskQueue.stop(): void;
// Starts executing the tasks. Does nothing if tasks are already running.
TaskQueue.start(): Promise<TaskQueueCompletedEvent>
// Convenience method to wait for all tasks to complete. Effectively the same
// as using an event listener for the ALL_WORKERS_IDLE event.
TaskQueue.waitForIdle(): Promise<TaskQueueCompletedEvent>;

// Properties
TaskQueue.totalWorkers: number;  // The total number of workers that can run in parallel. This value can be changed and will affect how many tasks can run in parallel. When the value is increased, more tasks will run in parallel immediately. When the value is decreased, none of the tasks will stop until they finish, but no new tasks will start until the number of running tasks is less than the totalWorkers value.
TaskQueue.isIdle: boolean;  // Indicates whether the queue is idle. In this case, idle means that there are no tasks running.
TaskQueue.pendingTasks: number;  // The number of tasks that are pending
TaskQueue.tasksRunning: number;  // The number of tasks that are currently running

// Static Values
TaskQueue.ALL_WORKERS_IDLE  // Event name for when all workers are idle
TaskQueue.TASK_ERROR        // Event name for when a task errors
TaskQueue.TASK_COMPLETED    // Event name for when a task completes

// This event is returned when all tasks are completed. It contains information about the events that were run
class TaskQueueCompletedEvent extends Event;

TaskQueueCompletedEvent.successfulTasks: number;  // The number of tasks that completed successfully
TaskQueueCompletedEvent.failedTasks: number;      // The number of tasks that failed
TaskQueueCompletedEvent.totalTasks: number;       // The total number of tasks that ran
```

The `TaskQueue` class is a task runner that runs an arbitrary quantity of tasks in parallel. The purpose is to provide a controllable means to run many tasks at the same time without using all available resources and slowing down other parts of the application.

It differs from slicing up arrays and using `Promise.all` or `Promise.allSettled` by pulling the next task from a list and immediately running it as soon as the previous task has finished. This allows the application to run multiple work loads in parallel up to a maximum quantity, but also doesn't require that all tasks are finished before the next batch can start.

The `TaskQueue` was designed to solve problems related to running many operations at the same time. An application may need to reach out to many URLs to perform operations or may need to read hundreds of files to process. In such a situation, a serial operation (sequentially running and completing each task) may take a long time and a strictly parallel operation may consume all available resources for a period of time, rendering the application unresponsive. One could slice up a large group of tasks (functions that perform a unit of work and are done once they complete) into many smaller arrays and use `Promise.all` or `Promise.allSettled`. The problem is that if one operation hangs, all operations will hang on completion until that one operation is finished.

In these examples, the `TaskQueue` class would be able to help as a mediator. The `TaskQueue` runs the next operation in a list as soon as the previous operation finished, which means that one hanging operation may tie up a single worker, but the remaining workers can still run operations.

The `TaskQueue` can run synchronous tasks, but is mostly meant for asynchronous tasks.

### Waiting for Completion

The `TaskQueue` has two different ways to wait for completion:

* Adding an event listener
* awaiting the `waitForIdle` method

The `TaskQueue` is an `EventTarget` and emits 3 different events:

`TaskQueue.ALL_WORKERS_IDLE` is emitted when all tasks have finished and the Queue is empty. The event emits with some metrics of successfully completed tasks and failed tasks with their errors.

`TaskQueue.TASK_ERROR` is emitted when a task has an error. The queue will not halt when a single task halts.

`TaskQueue.TASK_COMPLETED` is emitted when a task completes. The queue will continue to run other tasks.

A method is available that resolves when all tasks are completed: `waitForIdle`. `waitForIdle` only completes when all workers are idle. It will not throw if any task errors.

### Examples

```ts
import { TaskQueue } from '@metools/utils';

const tr = new TaskQueue({ totalWorkers: 5 }); // Set it to 5 workers

/** Uses the Event Listener API to listen for when all workers are idle. */
async function listenForCompletion(tasks) {
  const tq = new TaskQueue({ totalWorkers: 5 });

  return new Promise((res) => {
    tq.addEventListener(TaskQueue.ALL_WORKERS_IDLE, () => {
      console.log('All Tasks Completed')
      res();
    });

    tq.addTask(tasks);
  });
}

/** Uses the waitForIdle method to wait for all workers to be idle. */
async function useWaitForIdle(tasks) {
  taskQueue.addTasks(tasks);
  taskQueue.startExecution();
  await taskQueue.waitForIdle();
}
```


### Example

```ts
// Defined elsewhere. Gets file paths to read & process
const filepaths = getFilesToRead();

async function myTask(filepath: string) {
  // Read the file, parse contents, perform operation
}

// Maps all paths into an array of functions, i.e. tasks
// These functions have not been run, yet, they are read
// to be run with the filepath above as the argument.
const tasks = filepaths.map(
  (filepath: string) => (fp: string) => myTask(fp),
);

// Create the TaskQueue object with 30 workers to run
// in parallel and all the tasks
const taskQueue = new TaskQueue({
  workers: 30,
  tasks,
});

// Starts the tasks immediately
taskQueue.addTask(tasks);
await taskQueue.waitForIdle();
```

## wait

```ts
function wait (milliseconds: number = 0): Promise<void>;
```

Allows an app to wait for a presrcribed period of time. The argument adjusts the period of time to wait for. Note, this uses the `setTimeout` function from the JavaScript API. `setTimeout` is NOT guaranteed to run exactly after the prescribed period of time.

### Example

```ts
/// Waits for 1000ms, or 1 second
await wait(1000);
```