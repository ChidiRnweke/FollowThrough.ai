/**
 * Static name + description catalog for every agent tool definition, kept
 * dependency-free so startup scripts (seeds, migrations, audits) can read the
 * catalog without instantiating `AgentTools` or its controller factory. The
 * factory resolves its descriptions through `toolDescription`, so this module
 * is the single source of truth and any drift fails fast at module load.
 */

/**
 * Stable, frequently used tools the agent can call without first discovering
 * them. Everything else stays in the on-demand tool-search catalog.
 *
 * `search_note` is first-class not for frequency but because injected prompt
 * text names it: the oversized-context-note pointer tells the model to call it,
 * and a tool our own prompts reference must work without a discovery round-trip.
 */
export const FIRST_CLASS_TOOL_NAMES = [
	'search',
	'search_note',
	'list_user_memory',
	'list_project_memory',
	'get_workspace_context',
	'get_note',
	'list_todos',
	'load_skill',
	'propose_memory_change'
];

export interface ToolCatalogEntry {
	readonly name: string;
	readonly description: string;
}

/** Every tool defined by AgentTools.buildDefinitions(), first-class included. */
export const TOOL_DESCRIPTIONS: readonly ToolCatalogEntry[] = [
	{
		name: 'search',
		description:
			"Search the knowledge base — the user's notes, uploaded documents and PDFs, diagrams, and indexed remembered facts — for content relevant to a query. Use it when knowledge-base evidence could improve the answer, and search again with a more focused query when the first results reveal useful leads or gaps. Pass projectId to restrict results to one project."
	},
	{
		name: 'search_note',
		description:
			'Search within a single note — semantically ranked chunks from that note only, its diagrams included. Use it when an attached note was too large to include in the conversation, or when a question is clearly about one specific note.'
	},
	{
		name: 'get_workspace_context',
		description: 'Read projects, notes, skills, and pending work.'
	},
	{
		name: 'get_today_view',
		description: 'Read work due on a local date.'
	},
	{
		name: 'list_projects',
		description: 'List active projects.'
	},
	{
		name: 'get_project',
		description: 'Read a project and its note tree.'
	},
	{
		name: 'create_project',
		description: 'Create a project.'
	},
	{
		name: 'rename_project',
		description: 'Rename a project.'
	},
	{
		name: 'archive_project',
		description: 'Archive a project.'
	},
	{
		name: 'create_folder',
		description: 'Create a folder in a project.'
	},
	{
		name: 'move_project_entry',
		description: 'Move or reorder a note or folder.'
	},
	{
		name: 'get_note',
		description:
			'Read a note with backlinks, references, diagrams, todos, and proposals. The note body is returned as Markdown, which is the text edit_note anchors against and save_note replaces. Call this before your first edit_note or save_note on a note each turn.'
	},
	{
		name: 'create_note',
		description: 'Create a note.'
	},
	{
		name: 'save_note',
		description:
			'Replace a whole note body with Markdown. Pass only the noteId and complete desired Markdown body; use rename_note separately for the title. Prefer edit_note unless you are genuinely rewriting the note end to end — this tool discards anything you leave out. Skill bodies have their own tools: use save_skill or edit_skill instead.'
	},
	{
		name: 'edit_note',
		description:
			'Mutating tool. Before the first edit to a note in any turn, you MUST call get_note on that noteId and copy every oldText verbatim from its returned markdown — do not reconstruct anchors from memory, plain text, or earlier revisions. Each edit replaces an exact, unique snippet of the note\'s Markdown, and every edit must apply or none do. Prefer this over save_note for anything short of a full rewrite. If a call fails with "oldText was not found", re-run get_note, and copy the closest text from the error verbatim — never retry the same oldText. If it fails a second time, stop retrying the patch and use save_note with the complete desired body instead. Skill bodies are edited with edit_skill or save_skill, not this tool.'
	},
	{
		name: 'rename_note',
		description: 'Rename a note.'
	},
	{
		name: 'archive_note',
		description: 'Archive a note.'
	},
	{
		name: 'publish_note',
		description: 'Publish a note, creating a versioned snapshot.'
	},
	{
		name: 'discard_note_draft',
		description: 'Discard unpublished changes and revert to the last published version.'
	},
	{
		name: 'list_todos',
		description: 'List todos using optional filters.'
	},
	{
		name: 'create_todo',
		description: 'Create a todo.'
	},
	{
		name: 'create_todos',
		description:
			'Create multiple todos in one call. Prefer this over repeated create_todo calls when adding several todos.'
	},
	{
		name: 'update_todo',
		description: 'Edit a todo or change its status.'
	},
	{
		name: 'extract_promises',
		description: 'Propose todos from a text selection without bypassing review.'
	},
	{
		name: 'relate_selection',
		description: 'Propose relationships for a text selection.'
	},
	{
		name: 'find_references',
		description: 'Propose ranked references for a text selection.'
	},
	{
		name: 'generate_mermaid_diagram',
		description: 'Propose a Mermaid diagram from a text selection.'
	},
	{
		name: 'revise_mermaid_diagram',
		description: 'Revise a durable Mermaid diagram.'
	},
	{
		name: 'promote_diagram',
		description: 'Propose converting a durable Mermaid diagram to draw.io for explicit review.'
	},
	{
		name: 'list_suggestions',
		description: 'List reviewable suggestions by status.'
	},
	{
		name: 'accept_suggestion',
		description: 'Accept and apply a suggestion.'
	},
	{
		name: 'reject_suggestion',
		description: 'Reject a suggestion.'
	},
	{
		name: 'revert_suggestion',
		description: 'Revert an accepted suggestion.'
	},
	{
		name: 'list_skills',
		description: 'List enabled skill summaries and trigger hints.'
	},
	{
		name: 'load_skill',
		description:
			'Read a skill body as Markdown — its full instructions and details — and record usage. When a skill summary applies, load it here and follow its instructions before answering or acting.'
	},
	{
		name: 'save_skill',
		description:
			'Replace a whole skill body with Markdown. Pass only the noteId and the complete desired Markdown instructions; the skill summary, description, and trigger hints are changed separately. Prefer edit_skill unless you are genuinely rewriting the skill end to end — this tool discards anything you leave out.'
	},
	{
		name: 'edit_skill',
		description:
			'Mutating tool. Before the first edit to a skill in any turn, you MUST call load_skill on that noteId and copy every oldText verbatim from its returned Markdown — do not reconstruct anchors from memory, plain text, or earlier revisions. Each edit replaces an exact, unique snippet of the skill\'s Markdown, and every edit must apply or none do. Prefer this over save_skill for anything short of a full rewrite. If a call fails with "oldText was not found", re-run load_skill, and copy the closest text from the error verbatim — never retry the same oldText. If it fails a second time, stop retrying the patch and use save_skill with the complete desired body instead.'
	},
	{
		name: 'create_skill',
		description: 'Create a reusable skill.'
	},
	{
		name: 'create_skill_from_selection',
		description: 'Create a skill from selected note text.'
	},
	{
		name: 'list_skill_versions',
		description: 'List immutable revisions of a skill.'
	},
	{
		name: 'restore_skill_version',
		description: 'Restore an old skill revision as a new current revision.'
	},
	{
		name: 'update_skill',
		description:
			"Change a skill's summary or enable and disable it. Send only the fields to change. Instruction text is edited through the skill note itself."
	},
	{
		name: 'set_skill_pinned',
		description: 'Pin or unpin a skill for a project. Pinned skills lead the advertised catalogue.'
	},
	{
		name: 'list_api_tokens',
		description:
			'List the MCP access tokens for this workspace. Plaintext is never retrievable; only names, scopes, and timestamps.'
	},
	{
		name: 'revoke_api_token',
		description:
			'Revoke an MCP access token. Any client still using it stops working immediately. New tokens are created only in Settings.'
	},
	{
		name: 'list_attachments',
		description: 'List the immutable resources attached to a note or skill bundle.'
	},
	{
		name: 'read_attachment',
		description:
			'Read a bounded chunk from a safely parsed text or PDF attachment. Scripts are returned as text and never executed.'
	},
	{
		name: 'list_project_memory',
		description:
			'Read the durable memory entries a specific project shares with agents: facts, decisions, constraints, terminology, and preferences. Use when the request concerns an active or referenced project and its projectId is known.'
	},
	{
		name: 'list_user_memory',
		description:
			'Read the user profile memory shared with agents: who the user is, their role, goals, relationships, preferences, and working style across all projects.'
	},
	{
		name: 'propose_memory_change',
		description:
			'Propose adding, updating, or removing a memory entry without bypassing review. Scope "project" remembers durable project facts, decisions, constraints, and terminology. Scope "user" builds the user profile: whenever the user reveals who they are — role, team, goals, relationships, expertise, preferences, or how they like to work — propose remembering it so future conversations already know them.'
	},
	{
		name: 'list_trust_policies',
		description: 'Read pipeline-specific trust policies.'
	},
	{
		name: 'update_trust_policy',
		description: 'Change a pipeline-specific trust policy.'
	},
	{
		name: 'list_tool_preferences',
		description:
			"List every FollowThrough tool with whether it is currently turned on, and whether that came from the workspace default or a project override. Use it before changing a tool's availability, or when the user asks what the assistant can and cannot do. Pass projectId to see one project's resolved list."
	},
	{
		name: 'set_tool_enabled',
		description:
			'Turn a FollowThrough tool on or off, adding or removing a capability. Use it whenever the user asks to enable, disable, add or remove a tool, or tells the assistant to stop doing a kind of work entirely. Without projectId this sets the workspace default; with it, only that project changes. A few core tools are always available and will be refused.'
	},
	{
		name: 'get_agent_preferences',
		description:
			'Read the agent defaults: chat, vision, inline and attachment models, execution mode, inline suggestions, web search settings, and the turn limit.'
	},
	{
		name: 'update_agent_preferences',
		description:
			'Change any agent default: models, execution mode, inline suggestions, web search engine and result caps, or the per-run turn limit. Send only the fields to change; omitted fields keep their stored value and an explicit null clears one back to the deployment default.'
	},
	{
		name: 'list_agent_models',
		description: 'List OpenRouter chat models and tool support.'
	},
	{
		name: 'export_document',
		description:
			'Generate an artifact document (DOCX or PDF) from one or more project notes. Optionally apply a project template.'
	},
	{
		name: 'list_artifacts',
		description: 'List generated document artifacts for a project.'
	},
	{
		name: 'list_templates',
		description: 'List available DOCX templates for a project.'
	},
	{
		name: 'get_export_settings',
		description: 'Read the project document-export settings (font, size, line height, margins).'
	},
	{
		name: 'update_export_settings',
		description: 'Change the project document-export settings.'
	},
	{
		name: 'get_artifact',
		description: 'Read a generated artifact record.'
	},
	{
		name: 'download_artifact',
		description: 'Create a time-limited download link for a generated artifact.'
	},
	{
		name: 'delete_artifact',
		description: 'Delete a generated artifact.'
	},
	{
		name: 'regenerate_artifact',
		description: 'Regenerate an artifact from its source notes and return a fresh download link.'
	}
];

/** The on-demand catalog surfaced through search_tools: everything but first-class tools. */
export const TOOL_CATALOG: readonly ToolCatalogEntry[] = TOOL_DESCRIPTIONS.filter(
	(entry) => !FIRST_CLASS_TOOL_NAMES.includes(entry.name)
);

/** Looks up a tool description; throws if the catalog and definitions drift apart. */
export const toolDescription = (name: string): string => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	return entry.description;
};
