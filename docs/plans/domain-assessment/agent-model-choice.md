# Agent model choice ownership

## Meaning and entry paths

Deployment defaults, account preferences and conversation overrides are distinct facts. Chat and
vision resolution use conversation, then account, then deployment precedence. Attachment processing
uses its own account override and deployment default. The shared model-selection service owns these
rules. WorkspaceSession and AgentSettings use the same default resolution; Agent submission,
diagram generation and attachment processing call the same owner directly.

Models retain the canonical identifier constructor: it changes legacy colon spelling to slash
spelling without choosing a model or reading state. Configured catalog completion and attachment
selection leave models. The unused server resolveMaxTurns and resolveWebSearchOptions exports are
removed after checking all source/test callers. Agent.freezeInput still owns those active choices;
their removal changes no run input. Execution-mode resolution remains server owned.

Workspace bootstrap delegates configured chat catalog completion to AgentSettings.listModels. The
remote no longer constructs synthetic catalog entries. A chat default also declared as the vision
default retains both capabilities; the old bootstrap always marked its synthetic chat entry as unable
to read images. Provider metadata continues to take precedence when present.

## Configured choices and validation

The browser already keeps configured chat/vision choices available when a provider catalog omits
them. Server validation previously considered only provider entries. Explicitly choosing a deployment
default could therefore be rejected even though using it implicitly succeeded.

AgentSettings and explicit chat submission now read the catalog, add trusted deployment choices and
apply the shared role check. Chat requires tool support; vision requires image support; inline
generation only requires a known model. Existing provider metadata wins when an identifier is already
present. Unknown identifiers remain rejected. A catalog read failure propagates; it is not treated as
an empty successful catalog. Clearing a setting requires no catalog lookup.

The provider catalog service now owns fetching, mapping and caching only. Its validation methods and
their fake copies are removed. The evaluation catalog remains empty because its model is explicitly
pinned as the deployment default; it no longer bypasses validation with a no-op assertion method.
The browser's current-choice display still preserves account defaults. A retained account choice is
not newly trusted by the server merely because it appears in that display.

## Tests and remaining review

Move five model-precedence cases and two configured-choice cases to the shared owner. Remove broad
Conversation/AgentPreferences casts from the minimal, correctly typed facts. Keep execution-mode and
provider cache/metadata cases with the server service. Move the no-tool chat rejection guarantee to
the settings controller. Add attachment precedence and provider metadata retention cases.

Settings tests verify explicit deployment choices absent from the provider catalog, role restrictions
and catalog failure. The queued-receipt test now submits an explicit deployment model against an empty
provider catalog, preserving its durable-admission assertion. Existing agent, attachment and diagram
controller regressions exercise the updated callers.

No command or response shape changes, migration or component styling changes are required. This
disposition covers model choice and validation ownership. Environment parsing, provider payload
decoding and image-reader execution remain separate review items.

Local validation passed 23 focused files and 234 tests, then all 413 unit files and 3,926 tests.
Lint, type checks, architecture audits and documentation checks passed; docs report one existing hint.
The dependent PR records CI results.
