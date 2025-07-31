# @metools/utils

### Common Utilities that I use regularly.

This project contains a handful of tools I've developed in the past to help me manage my projects. My hope is that this project will continue to grow as I develop more tools that I use from project to project.

### arrayToObject

```typescript
function arrayToObject<T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T>;
```

This function that can convert a JavaScript array into an object. The function accepts an array as the first argument and a keygen function as a second argument. The keygen function is what generates the key of the object that's returned.

This function is generally used to convert an arary into a hashmap. This provides a means to access individual elements from an array using a common identifier, e.g. an id.

### Example

```javascript
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

### arrayToGroup

```typescript
function arrayToGroup<T>(
  input: T[],
  keygen: (kInput: T) => string | number,
): Record<string | number, T[]>;
```

This function is used to go through a list and group elements together by a common value. The end result is an object where the key is the said common value, and the value is an array of values that have that common value.

For example, you may have an array of transactions and you'd like to group these transactions together based upon who initiated the transaction, i.e. a user Id. The end result would be an object, where the keys are user Ids and the values are arrays of transactions.

### Example

```javascript
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

### mappedArrayToObject

```typescript
function mappedArrayToObject<T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U>;
```

This function combines `arrayToObject` with something similar to `Array.prototype.map`. The function performs a transform on each element, dictated by the `valuegen` argument and assigns the value to the key dictated by the `keygen` argument. This function allows users to transform their inputs rather than having to iterate over the array multiple times.

### Example

```javascript
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

### mappedArrayToGroup

```typescript
function mappedArrayToGroup<T, U>(
  input: T[],
  keygen: (kInput: T) => string | number,
  valuegen: (vInput: T) => U,
): Record<string | number, U[]>;
```

This function combines `arrayToGroup` and `mappedArrayToObject` together to let you group similar items together, while simultaneously transforming the values together as well. This lets you do things like group objects together by some common element (e.g. a user ID or maybe address state), while also making transforms on the data for easier use.

For instance, you may want to transform the data into something simple for export as a JSON string or to send to an API without having to add a ton of extra data.

### Example

```javascript
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
