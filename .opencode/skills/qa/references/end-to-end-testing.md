# End-to-end testing

Use a public user or API entry point when startup, composition, routing, deployment, or a
complete critical workflow adds evidence that narrower tests cannot supply. A browser is not
required for an API workflow.

## Write the workflow

1. Select one important user goal and the specific failure the public boundary can reveal.
2. Establish valid isolated data and the dependencies needed for that evidence. Record any
   substituted external service; a recorder does not prove delivery by that provider.
3. Perform the goal through the public application, rather than invoking its internal helpers.
4. Assert the user-visible result through the application's normal read path. Observe external
   effects where their required contract is visible.
5. Make cleanup and failure diagnostics reliable across interrupted runs. Run the workflow in
   the project's intended environment and report its actual scope.

## Example: accepting an invitation

```text
arrange: an isolated, unexpired invitation for a valid recipient
act: accept the invitation through the public application
assert: the application shows membership in the invited workspace
assert: reopening that workspace through the normal read path retains access
```

The reopening step observes the same acceptance's result. Database inspection can help diagnose
failure, but asserting private tables changes the evidence boundary. Most expiry-rule variants
belong in [unit tests](unit-testing.md); real persistence and wiring risks belong in
[integration tests](integration-testing.md).

Keep the set focused on distinct critical goals. One or two broad workflows can be a useful
starting point, not a maximum. Do not repeat every business-rule variation at the slowest layer
or enforce a pyramid ratio. CRUD-heavy systems may need mostly integration tests; for a small
API, public workflow checks may cost little more than in-process integration checks.

Prefer one goal per test. A naturally sequential workflow can justify several acts when splitting
has exceptional real dependency cost; document that reason. Do not combine independent goals
just to reuse setup. Put expensive checks after faster feedback when appropriate to the project's
delivery process. Wider scope does not excuse brittle internal assertions or uncontrolled data.
