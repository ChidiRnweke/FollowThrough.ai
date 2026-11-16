# Observability

FollowThrough writes logs and traces through OpenTelemetry. `scripts/otel-instrumentation.js`
bridges `console.*` to the collector, which sends logs to Loki and traces to Tempo and Phoenix.
Each log record carries the active span's trace id, so a log line and its trace can be joined.

## One canonical line per operation

The controller boundary (`src/lib/server/infrastructure/telemetry/controller-boundary.ts`) wraps
every public controller method. Each call writes one line when it completes:

| Outcome                           | Level | Content                                                                                   |
| --------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| The method returned               | info  | user, argument shape, outcome (`kind`, item count or `value`), duration                   |
| It returned `{ kind: 'failure' }` | warn  | user, argument shape, the failure's `error`, `code`, `reason`, `description` or `message` |
| It threw a `DomainError`          | warn  | the error, user, argument shape                                                           |
| It threw anything else            | error | the error, user, argument shape                                                           |

These lines carry metadata, never content. The argument shape keeps uuids, short lowercase
tokens (enum values, slugs, codes: at most 32 characters of `a-z 0-9 _ . -`), numbers, booleans
and `null` as they are. Any other string becomes `{ "length": n }`, an array, map or set
`{ "items": n }`, binary data `{ "bytes": n }`, and an object the shape of its fields. The walk
stops after 32 fields or three levels, so a large argument costs no more than a small one. A note
body, a chat prompt or a todo title therefore reaches the info line as its length.

The start of a call, with its full arguments, and its full result are logged at debug, which is
off in production. A per-user composition names its user in every line; authentication, OAuth
and system work name none.

One line per operation, written at the end, is the line an operator reads first: it states what
was asked, what happened and how long it took. A start line at info doubles the volume and says
nothing about the outcome.

## Service spans

Every server service constructed in a factory is wrapped by `tracedService`
(`src/lib/server/infrastructure/telemetry/service-boundary.ts`). Each public method call records
a `Service.method` span under the active controller or workflow span: timing and failure only,
no arguments, no results and no log line. Outside a trace the call runs untouched, so background
work opens no detached roots.

Service spans are leaves. The collector drops spans without an OpenInference kind before
Phoenix, so a service span that parented LLM or tool spans would split one Phoenix trace into
orphans. Spans a service starts stay children of the operation; Tempo shows the service span
beside them, with its duration.

## Returned failures are warnings

Expected refusals are returned as `{ kind: 'failure', … }` values rather than thrown (Chisel's
`fail-loudly:silent-catch` rule). The boundary logs them as warnings, so a refusal that never
throws — an OAuth `invalid_grant`, a client metadata document that cannot be used — is visible in
production, where debug records are dropped.

## What is never logged

- Arguments or results of a method marked `'redacted'` in `controller-surfaces.ts`. Mark every
  method whose arguments or result carry a credential: session ids, bearer headers, OAuth codes
  and tokens, connector secrets. Its failure reason fields are still logged, because none of them
  carries the credential.
- MCP authorization codes and tokens anywhere in a summary: `summarize` replaces `ftc_`, `fta_` and
  `ftr_` values with `<redacted>`.
- Base64 data URLs, which `summarize` elides. Every summary is capped at 500 characters.
- Argument content at info, warn or error: those lines carry the argument shape only.

The masking happens before `console.*` is called, so the stdout line and the OTLP log record
carry the same masked text. The trace exporter (`scripts/span-masking.js`) applies the same
credential redaction to every string span attribute, and elides inline base64 images longer
than 1024 characters.

## Content in agent traces

Phoenix exists to inspect agent runs (ADR 0030), so agent traces carry content by default: the
prompt and the answer on the `agent.turn` root, and the messages and tool payloads on the SDK's
model and tool spans. `AGENT_TRACE_CONTENT=false` removes that text. The turn root then carries
`followthrough.input.length` and `followthrough.output.length` beside the session, user, run and
model; the SDK spans keep their names, timing and token use (`traceIncludeSensitiveData: false`).
The setting is an application key, default `true`, read once at composition. It covers agent
turns only: the inline-suggestion, promise-extraction and retrieval spans still record the text
they were given.

## Entry points

An entry point logs a request it refuses before any controller runs once, at debug, through
`logRefusal` (`src/lib/server/infrastructure/http/refusal-log.ts`): an oversized or unparseable
OAuth registration, token, authorization or browser error request, and a cross-site form post
that `hooks.server.ts` refuses. The line carries the path and the reason only, never request
content. Anyone can send most of these requests, so their volume must not decide log volume in
production; the deployment's edge rate limits count them instead. Everything that reaches a
controller is logged by the boundary.

`/mcp` is the exception. Its transport refuses a request only after the bearer check passes, so
each refusal comes from an authenticated client and is logged at warn
(`src/lib/server/infrastructure/http/mcp-transport.ts`). The line carries the transport's reason,
such as a wrong `Host` header, and never the request body. Without it, a client that is refused on
every request leaves only 403 spans in production.

## Browser error reports

`/api/client-errors` writes each admitted browser report as one error line, with the user and,
when repeats were dropped since the user's previous line, `suppressed=n`. The `telemetry`
controller admits a report against a per-user budget kept in Postgres
(`CLIENT_ERROR_REPORTS_PER_WINDOW` per `CLIENT_ERROR_WINDOW_SECONDS`). A report whose message
and stack match one admitted inside the window is dropped with a 204 and not logged. A report past
the budget is answered 429 with `Retry-After`. The browser reads no answer and retries nothing.
`reportClientError` is outside the boundary (`false` in `controller-surfaces.ts`): a boundary
line per call would log every repeat the budget drops.

## Levels

`LOG_LEVEL` is a platform key: debug in development, info in production, error under vitest. Use
debug inside services for decision detail, warn for degraded behaviour that continues, and error
only for a failure someone has to fix.

## Reading production logs

The Grafana instance at `grafana.chidinweke.be` holds the Loki and Tempo data sources. With `gcx`
configured for it:

```bash
gcx datasources list
gcx logs query -d <loki-uid> '{service_name="followthrough"} |~ "mcpAuthorization|oauth"' --since 1h
gcx logs query -d <loki-uid> '{service_name="followthrough"} | detected_level="warn"' --since 1h
```
