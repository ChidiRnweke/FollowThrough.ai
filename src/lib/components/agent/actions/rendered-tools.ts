import type { ToolName } from '$lib/models/agent/tool-catalog';

/**
 * Which tools the turn summary names as its own rows, and which it deliberately
 * does not.
 *
 * The two sets answer exactly one question: does this call earn a row in the
 * settled turn summary? They decide nothing else. Every call still renders in
 * the turn's log, every name owes a reader-facing label in
 * `tool-presentation.ts` (total over the catalog, so a new tool does not
 * compile without one), and every tool owes a disclosure decision in
 * `tool-disclosure.ts`. An earlier version of this file also subtracted these
 * sets from the label maps, which is how "Grep completed" shipped: hiding a
 * call from the summary had silently meant not naming it anywhere.
 *
 * The {@link RenderedTool} type survives for the one map that is genuinely only
 * about summary rows — the `subjects` map in `turn-activity.ts`.
 */

/**
 * Calls that are the agent finding its footing rather than work on the workspace. A row
 * reading "Search tools" is not reassurance, and it is not something anyone can act on.
 *
 * `search_tools` and `use_tool` are the discovery mechanism rather than entries in what it
 * discovers, so they are the two names legitimately absent from the catalogue.
 */
export const mechanismToolNames = [
	'search_tools',
	'use_tool',
	'get_workspace_context',
	'load_skill',
	'list_tool_preferences',
	'set_tool_enabled',
	'list_agent_models',
	'get_agent_preferences',
	'update_agent_preferences',
	'list_trust_policies',
	'update_trust_policy',
	'list_api_tokens',
	'revoke_api_token'
] as const;

/**
 * Reads and searches whose rows would restate the answer they were gathering.
 *
 * The rule dividing this from a summary row is whether the call *changed*
 * anything. A search that found nine notes is the agent orienting itself, the
 * same as a tool search; the answer it produced is the thing worth reading.
 *
 * Stated as an explicit list because the default is the other way round: a tool
 * added tomorrow earns a summary row, and hiding one is a decision somebody
 * writes here.
 */
export const quietToolNames = [
	'search',
	'search_note',
	'ls',
	'grep',
	'sed',
	'search_icons',
	'find_references',
	'get_today_view',
	'get_artifact',
	'get_export_settings',
	'diff_note_versions',
	'read_canvas_diagram',
	'read_project_diagram',
	'list_projects',
	'list_todos',
	'list_skills',
	'list_skill_versions',
	'list_artifacts',
	'list_attachments',
	'list_templates',
	'list_suggestions',
	'list_trashed_notes',
	'list_user_memory',
	'list_project_memory'
] as const;

export type MechanismTool = (typeof mechanismToolNames)[number];
export type QuietTool = (typeof quietToolNames)[number];

/**
 * A tool the turn summary can name as a row of its own, and therefore the type
 * the `subjects` map in `turn-activity.ts` is total over. Subtracting the two
 * hidden sets from the catalogue means a new tool lands here by default — which
 * is what makes forgetting to classify it a compile error instead of a machine
 * name on screen.
 */
export type RenderedTool = Exclude<ToolName, MechanismTool | QuietTool>;

export const mechanismTools: ReadonlySet<string> = new Set(mechanismToolNames);
export const quietTools: ReadonlySet<string> = new Set(quietToolNames);
