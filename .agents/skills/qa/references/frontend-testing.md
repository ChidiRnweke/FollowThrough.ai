# Frontend testing

Test what the user can see and do. Keep pure presentation decisions in unit tests, interaction
and rendering in component tests, and application composition or browser behavior in public UI
workflows. Use the project's existing runner and supported browser setup.

## Choose a scenario

| Risk                                                      | Boundary                                        | Required observation                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Incorrect formatting or selection rule                    | Unit                                            | Independently known displayed value or decision                                                                       |
| A control does not perform its action                     | Rendered component                              | User interaction changes the visible result or emits the declared public event                                        |
| A form submits invalid data or hides errors               | Component; wider workflow for server validation | Invalid input shows the required error and causes no prohibited submission; valid input produces the expected outcome |
| Loading, empty, failure, or retry state is wrong          | Component with a controlled typed dependency    | The specified state appears, then changes correctly after the controlled result                                       |
| Routes, auth, wiring, or persistence break a goal         | Browser/application workflow                    | The goal succeeds through the public UI and the normal read path retains its result                                   |
| A control is clipped, obscured, or unusable at a viewport | Real browser                                    | It is visible, reachable, and usable in the required layout                                                           |

These are applications of behavior-based testing to UI work. DOM-only environments cannot
establish browser geometry or actual interaction reachability.

## Write an interaction test

1. Render the real component with minimal valid data. Keep the decisive label, value, and state
   visible in setup. Replace only needed I/O boundaries; keep rendering and event handling real.
2. Locate the control through its semantic role and accessible name, or another stable public
   identifier when semantic selection cannot express the target. Avoid CSS structure, framework
   internals, and private instance methods.
3. Perform the user action: type, select, submit, or activate the control through the runner's
   interaction API. A public component event can be the contract; an internal handler call is not.
4. Wait for the specified visible result with the runner's supported asynchronous assertions.
   Do not use fixed sleeps as evidence that rendering or a request finished.
5. Assert the complete relevant outcome: updated content, meaningful error, required event
   payload, or no prohibited effect. Do not snapshot the entire rendered tree for one rule.

## Bad versus good: a save control

```text
bad:
  render the editor
  assert a Save element exists in the DOM
  OR invoke the private save handler and assert an internal service call

good component scenario:
  render a valid editor with an editable title and a controlled persistence boundary
  enter "Quarterly review" and activate Save through the visible control
  resolve the persistence operation successfully
  assert the displayed title is "Quarterly review" and the required saved state appears

good browser scenario for persistence:
  edit and save a valid record through the application
  reopen it through the normal UI read path
  assert the title is still "Quarterly review"
```

Presence alone misses a clipped or disabled control. For a layout regression, reproduce the
affected viewport and UI state in a real browser; verify visibility, hit-target reachability,
and successful activation. Use relevant visual evidence when requested. A screenshot alone
does not establish functional correctness.

## Test asynchronous states deliberately

- **Loading:** keep the dependency pending; assert the required progress state and interaction
  availability. Then resolve it and assert the final content.
- **Empty:** return a valid empty result; assert the intended empty state and available action.
- **Failure:** return the specified failure; assert the user-visible error rather than fallback
  success content. If retry is part of the contract, activate it and verify recovery.
- **Validation:** provide the invalid input, submit, and assert the meaningful error and absence
  of prohibited effects. Cover server rejection through the real boundary when that is the risk.
- **Stale result:** when concurrent requests matter, resolve them in controlled reverse order
  and assert that the result for the current selection remains displayed.

Give each scenario fresh state and restore test-owned resources. Component tests with a typed
fake do not prove server compatibility; keep that evidence in integration tests. Critical
frontend goals may need [end-to-end coverage](end-to-end-testing.md); do not duplicate every
component variant through a browser workflow.
