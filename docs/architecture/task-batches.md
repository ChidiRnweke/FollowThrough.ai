# Task batch creation

`Todos.createBatch` creates all requested tasks and their saved outcome in one transaction.
The controller coordinates task creation and receipts. The receipt service enforces request
identity; its repository owns database locks and storage.

Each request carries a UUID `requestId`, one project, and an ordered list of tasks. Both the
agent and MCP `create_todos` tool require this field. A caller chooses the ID before sending
the first request and retains it when retrying an uncertain outcome. A new intended batch
needs a new ID. Requests without an ID fail validation.

The receipt key includes the account ID. Concurrent requests for the same key serialize on
a transaction lock. Identical input returns the saved result, including original task IDs and
order. Different input under the same key fails. JSON object key order does not affect equality.

A task failure or receipt failure rolls back the whole batch. A committed receipt survives a
lost response. It records the original result even if the tasks are later edited or deleted;
retrying creation does not restore or recreate them. Reading an invalid saved result fails
instead of creating a replacement batch.

Migration `0055_todo_batch_receipts` adds the receipt table. Account deletion removes its
receipts. The existing tool limit of 20 tasks per batch remains unchanged.
