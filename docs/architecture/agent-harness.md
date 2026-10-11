# Agent harness

The agent harness runs chat agent runs and serves MCP clients. It composes the OpenAI agents SDK
over a list of tools that it receives. It knows no specific tool. This document describes how the
parts connect. ADR 0007 records the decision; the tool failure contract is in
[tool recovery invariants](tool-recovery-invariants.md).

## Parts

| Part             | Location                                         | Role                                                                                                     |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Harness          | `server/controllers/agent/controller.ts`         | `AgentHarness`, implemented by `AgentSdkHarness`. Owns run lifecycle, tool policy and persistence.       |
| Turn service     | `server/services/agent/runs/turns.ts`            | Owns the model provider. Runs one SDK turn, parses its events and classifies provider failures.          |
| History service  | `server/services/agent/conversations/history.ts` | Loads, rewinds and snapshots the conversation items that the SDK replays.                                |
| Tool definitions | `server/factories/agent/tools/definitions.ts`    | Builds one `AgentTool` per controller operation for chat and for MCP.                                    |
| Tool set         | `server/factories/agent/tools/toolset.ts`        | Turns `AgentTool`s and a policy into SDK tools: direct, discoverable, `search_tools` and approval gates. |
| MCP server       | `server/factories/agent/tools/mcp.ts`            | Turns an `McpToolSession` into an MCP server for one request.                                            |
| Tool protocol    | `models/agent-tool-protocol/`                    | The types that connect the parts: `AgentTool`, `AgentToolPolicy`, `AgentToolset`, `McpToolSession`.      |
| Provider factory | `server/factories/agent/agent-providers.ts`      | Builds the OpenRouter model and image providers that the turn service owns.                              |

The capability factory connects these parts. The harness receives the tool constructors, not the
tools, because each run builds its tools for its own provenance and request. The constructors take
no actor: they wrap the controller factory of the actor the harness was built for.

## A tool is an entry point

A tool is like a remote function. The tool factory turns one public controller operation into a
tool. The tool parses the model's arguments into a model type, calls the operation, and converts
the result into its output. A tool does not sequence operations, and it does not call services or
repositories. Controllers and services do not know that a tool calls them.

Each `AgentTool` carries metadata: its name, description, classification (`read`, `mutation`, and
so on) and parameter schema. The harness reads only this metadata. A tool has one of two kinds:

- A **direct** tool runs one operation. Its output is the operation's result, projected to the
  fields the model reads, checked to be JSON, and narrowed to any creation-time range the call
  asked for.
- A **reviewed** tool changes a note or a skill. Its review prepares the exact change with
  `notes.prepareChange`, the user accepts or rejects that change, and the accepted change is
  applied with `notes.applyReviewedChange`. These are two entry points separated by the user's
  decision, not one tool sequencing two operations. An MCP host approves its own calls, so the MCP
  server applies a prepared change at once.

An operation that needs a project fails with `ProjectChoiceRequiredError` when the caller names
none, and lists the projects to choose from. The tool turns that error into text that tells the
model how to choose, or to create a project first.

The semantic checker enforces the rule. The `tool-factory` layer covers
`server/factories/agent/tools/`, and the `tool-operation` rule rejects a tool that reaches service
behavior.

## One run

A run is a database row. The harness reads and writes it through services; no run state stays in
process memory between operations.

1. **Submit.** `submit` freezes the request: model, research settings, context and execution mode.
   It stores the run as `queued` and starts execution in the background.
2. **Prepare tools.** `execute` builds the run's tools, then removes the tools that the user
   switched off for the workspace or the project. It plans which tools the model sees at once and
   which it must find with `search_tools`. Tools that an earlier turn of the conversation found
   stay available, so the model does not call a tool that its own history shows but the run no
   longer offers. The execution mode decides which classifications need approval.
3. **Turn.** The turn service runs one SDK turn with the tool set, the loaded history and the
   prompt. The harness persists each event as it streams. A completed mutation marks the
   workspace stale, so clients synchronize.
4. **Park or complete.** If a tool needs approval, the SDK interrupts the turn. The harness stores
   the serialized SDK state, the session items and one `approval_required` event per pending call
   in one transaction. The run waits in `awaiting_approval`. Otherwise the harness stores the
   session items and completes the run.
5. **Decide.** `decide` and `decideMany` record the user's decisions. When every pending call has a
   decision, the run executes again. The turn service restores the SDK state and applies the
   decisions. A reviewed tool restores its saved review before it applies the change, so a reject
   or an edit acts on the change that the user saw.

The harness holds no transaction while a tool runs. Each tool's operation commits on its own.

## Cancellation

`cancel` moves the run to `cancelling` in the database. The executing process listens for run
changes through Postgres `LISTEN/NOTIFY`, aborts the turn at the next event boundary and settles
the run as `cancelled`. A park or a completion that loses the race with a cancellation also
settles as `cancelled`. Cancellation therefore works across processes, and a grace timer settles a
run whose executor does not respond.

## Failures

The turn service owns the provider, so it parses the provider's events and turns provider errors
into `AgentProviderFailure`. A tool reports an application failure as a value in the shape that
[tool recovery invariants](tool-recovery-invariants.md) define. The model reads that value and can
retry. A failure that is not a tool failure fails the run.

## MCP

An MCP request uses the same tool definitions. The route verifies the bearer token through the
authentication controller, builds the token user's controller factory, and calls `openMcpTools`
with the token's scope and provenance. The harness applies the same tool preferences and limits a read-only
token to `read` tools. The MCP server factory turns the resulting `McpToolSession` into a server
for that request. MCP has no approval park: the MCP host makes its own approval decisions, so a
call runs as soon as the token authorizes it.

## Testing

Tests fake whole services. `InMemoryAgentTurns` and `ScriptedAgentTurns` stand in for the turn
service and stream configured events. The tool surface fixture builds the real tool definitions
and tool set over in-memory controllers. PostgreSQL contracts under `tests/integration/agent`
cover cancellation, settlement and notification delivery.
