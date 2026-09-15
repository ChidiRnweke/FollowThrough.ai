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
 *
 * `edit_note` and `save_note` are first-class for the same reason plus frequency:
 * they are the app's most common mutations, the prompt's note-safety rules name
 * both, and every production `Tool not found` failure was a note write that had
 * to survive a discovery round-trip first. Two extra schemas per generation is a
 * cheaper price than losing the user's edit.
 */
export const FIRST_CLASS_TOOL_NAMES = [
	'ls',
	'grep',
	'sed',
	'search',
	'search_note',
	'list_user_memory',
	'list_project_memory',
	'get_workspace_context',
	'get_note',
	'list_todos',
	'load_skill',
	'propose_memory_change',
	'edit_note',
	'save_note',
	// Direct rather than long-tail: it is the only way the agent can put a diagram
	// in front of the user, and every turn of a studio conversation is about to
	// need it. Nothing here is seeded into `tool_embeddings` — see `TOOL_CATALOG` —
	// because a first-class tool is offered outright and never retrieved.
	'create_diagram',
	'edit_diagram'
] as const satisfies readonly ToolName[];

export interface ToolCatalogEntry {
	readonly name: string;
	readonly description: string;
	readonly classification: 'read' | 'proposal' | 'mutation';
	/** Concise intent language used only for semantic tool discovery. */
	readonly retrievalText?: string;
	/**
	 * `app` for a tool whose whole effect lands in a surface of this application.
	 *
	 * These are not offered over MCP at all. An external host has no workbench, so
	 * the tool's entire result would happen in a window the caller cannot see.
	 */
	readonly surface?: 'app';
}

/**
 * Every tool defined by AgentTools.buildDefinitions(), first-class included.
 *
 * `as const satisfies` rather than an annotation: the annotation widened every
 * `name` to `string`, so nothing downstream could be held total over the
 * catalog. `satisfies` still checks each entry against {@link ToolCatalogEntry},
 * while `as const` keeps the literal names — which is what lets
 * {@link ToolName} exist, and what makes a tool that renders without a label a
 * compile error rather than a machine name shown to a user.
 */
export const TOOL_DESCRIPTIONS = [
	{
		name: 'ls',
		classification: 'read',
		description:
			'List a virtual directory or inspect one virtual file. Defaults to ".". File entries always include byte, token, and line counts, media type, checksum, and stable id so you can choose a precise grep or sed read.'
	},
	{
		name: 'grep',
		classification: 'read',
		description:
			'Search a virtual file or directory recursively. Pattern uses safe RE2 regular-expression syntax by default; set fixed for literal text and ignoreCase for case-insensitive matching. Returns Unix-like exitCode 0 for matches and 1 for a valid search with no matches.'
	},
	{
		name: 'sed',
		classification: 'read',
		description:
			'Read an explicit inclusive line range from one virtual file. Use range kind "lines" with startLine/endLine or "to_end" with startLine. This tool is read-only and never clamps an invalid starting line or guesses a path.'
	},
	{
		name: 'search',
		classification: 'read',
		description:
			"Search the knowledge base — the user's notes, uploaded documents and PDFs, diagrams, and indexed remembered facts — for content relevant to a query. Use it when knowledge-base evidence could improve the answer, and search again with a more focused query when the first results reveal useful leads or gaps. Pass projectId to restrict results to one project."
	},
	{
		name: 'search_note',
		classification: 'read',
		description:
			'Search within a single note — semantically ranked chunks from that note only, its diagrams included. Use it when an attached note was too large to include in the conversation, or when a question is clearly about one specific note.'
	},
	{
		name: 'get_workspace_context',
		classification: 'read',
		description: 'Read projects, notes, skills, and pending work.'
	},
	{
		name: 'get_today_view',
		classification: 'read',
		description: 'Read work due on a local date.'
	},
	{
		name: 'list_projects',
		classification: 'read',
		description: 'List active projects.'
	},
	{
		name: 'get_project',
		classification: 'read',
		description: 'Read a project and its note tree.'
	},
	{
		name: 'create_project',
		classification: 'mutation',
		description: 'Create a project.'
	},
	{
		name: 'rename_project',
		classification: 'mutation',
		description: 'Rename a project.'
	},
	{
		name: 'archive_project',
		classification: 'mutation',
		description: 'Archive a project.'
	},
	{
		name: 'create_folder',
		classification: 'mutation',
		description: 'Create a folder in a project.'
	},
	{
		name: 'move_project_entry',
		classification: 'mutation',
		description: 'Move or reorder a note or folder.'
	},
	{
		name: 'get_note',
		classification: 'read',
		description:
			'Read a note with backlinks, references, diagrams, todos, proposals, and the authoritative Markdown file descriptor. Call this before your first edit_note or save_note, then use sed or grep on body.file.path; that exact text is what edits anchor against.'
	},
	{
		name: 'create_note',
		classification: 'mutation',
		description: 'Create a note.'
	},
	{
		name: 'save_note',
		classification: 'mutation',
		retrievalText: 'replace or rewrite an entire existing note body with complete markdown',
		description:
			'Replace a whole note body with Markdown. Pass only the noteId and complete desired Markdown body; use rename_note separately for the title. Use this only when the user asked for a full end-to-end rewrite or the note is empty and you are populating it. A request to tidy, refresh, polish, or improve an existing note is not a full rewrite: use edit_note and preserve every existing fact. This tool discards anything you leave out, so it is never the way to recover from a failed edit_note. Skill bodies have their own tools: use save_skill or edit_skill instead.'
	},
	{
		name: 'edit_note',
		classification: 'mutation',
		retrievalText:
			'change, tidy, refresh, polish, or improve part of an existing note while preserving every existing fact and all unrelated content',
		description:
			'Mutating tool. Use this for an underspecified tidy, refresh, polish, or improvement: preserve every existing fact and make only small anchored changes. Before the first edit to a note in any turn, you MUST call get_note, then sed or grep its body.file.path and copy every oldText verbatim from that authoritative Markdown. Do not reconstruct anchors from memory, plain text, or earlier revisions. Batch multiple verified replacements for the same note into one call, with no more than five complete replacements per call; continue extensive changes in a later batch after the first succeeds. Every edit object requires both oldText and newText strings. Never send an edit whose newText is identical to oldText. Each edit replaces an exact, unique snippet, and every edit must apply or none do. If an anchor is not found, re-read the file; never retry the same oldText or fall back to save_note.'
	},
	{
		name: 'rename_note',
		classification: 'mutation',
		description: 'Rename a note.'
	},
	{
		name: 'archive_note',
		classification: 'mutation',
		description: 'Move a note to the trash. It stays restorable with restore_note.'
	},
	{
		name: 'restore_note',
		classification: 'mutation',
		description: 'Bring a note back from the trash.'
	},
	{
		name: 'list_trashed_notes',
		classification: 'read',
		description: 'List the notes in the trash, most recently discarded first.'
	},
	{
		name: 'delete_note_forever',
		classification: 'mutation',
		description:
			'Mutating tool. Permanently delete a note that is already in the trash, together with any trashed notes inside it if it is a folder. This cannot be undone and there is no way to recover the note afterwards, so confirm with the user first. To discard a note that is still active, use archive_note instead.'
	},
	{
		name: 'empty_note_trash',
		classification: 'mutation',
		description:
			'Mutating tool. Permanently delete every note in the trash, or only those of one project when projectId is given. This cannot be undone, so confirm with the user first. Call list_trashed_notes to show what would go.'
	},
	{
		name: 'list_note_versions',
		classification: 'read',
		description:
			"List a note's published version history, newest first, marking the current published version. Use restore_note_version to roll one back."
	},
	{
		name: 'diff_note_versions',
		classification: 'read',
		description:
			"Show what changed between a note's published version and another version (the current published one by default) as a compact unified diff. Full version bodies are files under the note's versions directory; use ls then sed when the diff is insufficient."
	},
	{
		name: 'restore_note_version',
		classification: 'mutation',
		description:
			'Roll a note back to one of its published versions, copied forward as a new revision so the rollback is itself undoable.'
	},
	{
		name: 'publish_note',
		classification: 'mutation',
		description: 'Publish a note, creating a versioned snapshot.'
	},
	{
		name: 'discard_note_draft',
		classification: 'mutation',
		description: 'Discard unpublished changes and revert to the last published version.'
	},
	{
		name: 'list_todos',
		classification: 'read',
		description: 'List todos using optional filters.'
	},
	{
		name: 'create_todo',
		classification: 'mutation',
		description: 'Create a todo.'
	},
	{
		name: 'create_todos',
		classification: 'mutation',
		description:
			'Create multiple todos in one call. Prefer this over repeated create_todo calls when adding several todos.'
	},
	{
		name: 'update_todo',
		classification: 'mutation',
		description: 'Edit a todo or change its status.'
	},
	{
		name: 'extract_promises',
		classification: 'proposal',
		retrievalText:
			'selected highlighted passage with implied commitments obligations promises or action items; propose todos for review',
		description: 'Propose todos from a text selection without bypassing review.'
	},
	{
		name: 'relate_selection',
		classification: 'proposal',
		retrievalText:
			'selected highlighted passage; find related internal notes connections or backlinks and propose relationships for review',
		description: 'Propose relationships for a text selection.'
	},
	{
		name: 'find_references',
		classification: 'proposal',
		retrievalText:
			'substantiate or verify a selected highlighted claim with external sources citations references or web evidence; propose ranked references for review',
		description: 'Propose ranked references for a text selection.'
	},
	{
		name: 'revise_mermaid_diagram',
		classification: 'mutation',
		description: 'Revise a durable Mermaid diagram.'
	},
	{
		name: 'promote_diagram',
		classification: 'proposal',
		description: 'Propose converting a durable Mermaid diagram to draw.io for explicit review.'
	},
	{
		name: 'list_suggestions',
		classification: 'read',
		description: 'List reviewable suggestions by status.'
	},
	{
		name: 'accept_suggestion',
		classification: 'mutation',
		description: 'Accept and apply a suggestion.'
	},
	{
		name: 'reject_suggestion',
		classification: 'mutation',
		description: 'Reject a suggestion.'
	},
	{
		name: 'revert_suggestion',
		classification: 'mutation',
		description: 'Revert an accepted suggestion.'
	},
	{
		name: 'list_skills',
		classification: 'read',
		description: 'List enabled skill summaries and trigger hints.'
	},
	{
		name: 'load_skill',
		classification: 'read',
		description:
			'Read a skill body as Markdown — its full instructions and details — and record usage. When a skill summary applies, load it here and follow its instructions before answering or acting.'
	},
	{
		name: 'save_skill',
		classification: 'mutation',
		description:
			'Replace a whole skill body with Markdown. Pass only the noteId and the complete desired Markdown instructions; the skill summary, description, and trigger hints are changed separately. Prefer edit_skill unless you are genuinely rewriting the skill end to end — this tool discards anything you leave out.'
	},
	{
		name: 'edit_skill',
		classification: 'mutation',
		description:
			'Mutating tool. Before the first edit to a skill in any turn, you MUST call load_skill on that noteId and copy every oldText verbatim from its returned Markdown — do not reconstruct anchors from memory, plain text, or earlier revisions. Each edit replaces an exact, unique snippet of the skill\'s Markdown, and every edit must apply or none do. Prefer this over save_skill for anything short of a full rewrite. If a call fails with "oldText was not found", re-run load_skill, and copy the closest text from the error verbatim — never retry the same oldText. If it fails a second time, stop retrying the patch and use save_skill with the complete desired body instead.'
	},
	{
		name: 'create_skill',
		classification: 'mutation',
		description: 'Create a reusable skill.'
	},
	{
		name: 'create_skill_from_selection',
		classification: 'mutation',
		retrievalText:
			'turn highlighted or selected note text describing a repeatable routine, process, checklist, or workflow into a reusable skill for future use',
		description: 'Create a skill from selected note text.'
	},
	{
		name: 'list_skill_versions',
		classification: 'read',
		description: 'List immutable revisions of a skill.'
	},
	{
		name: 'restore_skill_version',
		classification: 'mutation',
		description: 'Restore an old skill revision as a new current revision.'
	},
	{
		name: 'update_skill',
		classification: 'mutation',
		description:
			"Change a skill's summary or enable and disable it. Send only the fields to change. Instruction text is edited through the skill note itself."
	},
	{
		name: 'set_skill_pinned',
		classification: 'mutation',
		description: 'Pin or unpin a skill for a project. Pinned skills lead the advertised catalogue.'
	},
	{
		name: 'list_api_tokens',
		classification: 'read',
		description:
			'List the MCP access tokens for this workspace. Plaintext is never retrievable; only names, scopes, and timestamps.'
	},
	{
		name: 'revoke_api_token',
		classification: 'mutation',
		description:
			'Revoke an MCP access token. Any client still using it stops working immediately. New tokens are created only in Settings.'
	},
	{
		name: 'list_attachments',
		classification: 'read',
		retrievalText:
			'list find access open or read uploaded attached files, PDF documents, and immutable resources on a note or skill bundle',
		description: 'List the immutable resources attached to a note or skill bundle.'
	},
	{
		name: 'list_project_memory',
		classification: 'read',
		description:
			'Read the durable memory entries a specific project shares with agents: facts, decisions, constraints, terminology, and preferences. Use when the request concerns an active or referenced project and its projectId is known.'
	},
	{
		name: 'list_user_memory',
		classification: 'read',
		description:
			'Read the user profile memory shared with agents: who the user is, their role, goals, relationships, preferences, and working style across all projects.'
	},
	{
		name: 'propose_memory_change',
		classification: 'proposal',
		description:
			'Propose adding, updating, or removing a memory entry without bypassing review. Scope "project" remembers durable project facts, decisions, constraints, and terminology. Scope "user" builds the user profile: whenever the user reveals who they are — role, team, goals, relationships, expertise, preferences, or how they like to work — propose remembering it so future conversations already know them. For a user add, send scope, operation, and content; omit projectId and memoryEntryId entirely. Confidence is an optional integer percentage from 0 to 100; use 90, never 0.9.'
	},
	{
		name: 'list_trust_policies',
		classification: 'read',
		description: 'Read pipeline-specific trust policies.'
	},
	{
		name: 'update_trust_policy',
		classification: 'mutation',
		description: 'Change a pipeline-specific trust policy.'
	},
	{
		name: 'list_tool_preferences',
		classification: 'read',
		description:
			"List every FollowThrough tool with whether it is currently turned on, and whether that came from the workspace default or a project override. Use it before changing a tool's availability, or when the user asks what the assistant can and cannot do. Pass projectId to see one project's resolved list."
	},
	{
		name: 'set_tool_enabled',
		classification: 'mutation',
		description:
			'Turn a FollowThrough tool on or off, adding or removing a capability. Use it whenever the user asks to enable, disable, add or remove a tool, or tells the assistant to stop doing a kind of work entirely. Without projectId this sets the workspace default; with it, only that project changes. A few core tools are always available and will be refused.'
	},
	{
		name: 'get_agent_preferences',
		classification: 'read',
		description:
			'Read the agent defaults: chat, vision, inline and attachment models, execution mode, inline suggestions, web search settings, and the turn limit.'
	},
	{
		name: 'update_agent_preferences',
		classification: 'mutation',
		description:
			'Change any agent default: models, execution mode, inline suggestions, web search engine and result caps, or the per-run turn limit. Send only the fields to change; omitted fields keep their stored value and an explicit null clears one back to the deployment default.'
	},
	{
		name: 'list_agent_models',
		classification: 'read',
		description: 'List OpenRouter chat models and tool support.'
	},
	{
		name: 'export_document',
		classification: 'mutation',
		description:
			'Generate an artifact document (DOCX or PDF) from one or more project notes. Optionally apply a project template.'
	},
	{
		name: 'create_diagram',
		classification: 'read',
		surface: 'app',
		description:
			'Create a diagram in a project. Takes a projectId and uncompressed mxfile XML, and saves it as an unpublished working revision — the user approves the call first and publishes when they are ready. Send raw XML, never HTML-escaped: the source must start with a literal "<". Use edit_diagram to change one that already exists.',
		retrievalText: 'show render draw a diagram on the canvas for the user to look at'
	},
	{
		name: 'edit_diagram',
		classification: 'mutation',
		surface: 'app',
		description:
			'Change an existing draw.io diagram. First call read_project_diagram for its verified id and file path, then sed that file for the exact mxfile XML. Send raw XML, never HTML-escaped: the source must start with a literal "<". The change is saved onto that diagram as a new working revision and appears in its tab; what the user has published does not change until they publish it. This is the only way to change a diagram — create_diagram makes a new one.',
		retrievalText: 'revise change update an existing saved diagram'
	},
	{
		name: 'read_canvas_diagram',
		classification: 'read',
		// Reads *this conversation's* canvas. An MCP host has neither, so the tool
		// could only ever fail there.
		surface: 'app',
		description:
			'Read the diagram this conversation last wrote, including its id and full source as stored. Diagram source is left out of your history because it is large, so read it here before changing a diagram you wrote earlier.',
		retrievalText: 'read the current diagram source on the canvas before revising it'
	},
	{
		name: 'search_icons',
		classification: 'read',
		description:
			"Find a logo or icon to put in a diagram. Search one word at a time — 'azure', 'kubernetes', 'postgres' — because the library matches names, not phrases. Each result carries a URL to use directly in a draw.io style as shape=image;image=<url>.",
		retrievalText: 'find a logo brand icon image for a diagram shape'
	},
	{
		name: 'read_project_diagram',
		classification: 'read',
		description:
			'Read a saved project diagram metadata, labels, and its exact virtual file path. Use sed on that path only when you need the Mermaid or draw.io source.',
		retrievalText: 'inspect read an existing saved diagram in this project'
	},
	{
		name: 'list_artifacts',
		classification: 'read',
		description: 'List generated document artifacts for a project.'
	},
	{
		name: 'list_templates',
		classification: 'read',
		description: 'List available DOCX templates for a project.'
	},
	{
		name: 'get_export_settings',
		classification: 'read',
		description: 'Read the project document-export settings (font, size, line height, margins).'
	},
	{
		name: 'update_export_settings',
		classification: 'mutation',
		description: 'Change the project document-export settings.'
	},
	{
		name: 'get_artifact',
		classification: 'read',
		description: 'Read a generated artifact record.'
	},
	{
		name: 'download_artifact',
		classification: 'read',
		description: 'Create a time-limited download link for a generated artifact.'
	},
	{
		name: 'delete_artifact',
		classification: 'mutation',
		description: 'Delete a generated artifact.'
	},
	{
		name: 'regenerate_artifact',
		classification: 'mutation',
		description: 'Regenerate an artifact from its source notes and return a fresh download link.'
	}
] as const satisfies readonly ToolCatalogEntry[];

/** Every tool name the catalog defines. */
export type ToolName = (typeof TOOL_DESCRIPTIONS)[number]['name'];

/** A tool the agent may call without a discovery round-trip. */
export type FirstClassToolName = (typeof FIRST_CLASS_TOOL_NAMES)[number];

/** A tool `search_tools` must surface before the model can call it. */
export type LongTailToolName = Exclude<ToolName, FirstClassToolName>;

/**
 * Membership for callers holding a {@link ToolName}. The const tuple above
 * carries literals so {@link FirstClassToolName} can exist, which also means
 * its own `includes` rejects any name outside the first-class set — the
 * question every caller is actually asking.
 */
export const FIRST_CLASS_TOOL_SET: ReadonlySet<ToolName> = new Set<ToolName>(
	FIRST_CLASS_TOOL_NAMES
);

/**
 * Every tool name the agent surface can produce, catalog or not.
 *
 * `search_tools` is the one name that is not a {@link ToolName}: it is assembled
 * inside `AgentTools.agentTools()` rather than defined, so it is bound to no
 * controller method and has no {@link TOOL_DESCRIPTIONS} entry. It is still a
 * name the provider calls and the journal stores, and pretending otherwise is
 * what kept every persisted tool name a bare `string`.
 *
 * The union is measured rather than guessed: across the 2554 stored run events
 * and 129 stored tool messages in `tests/corpus/`, every name is a catalog name
 * except `search_tools`, which accounts for 38 and 10 rows respectively.
 * `tests/unit/corpus.spec.ts` holds that at zero exceptions.
 */
export type AgentToolName = ToolName | 'search_tools';

/**
 * The {@link AgentToolName} values, as a list `z.enum` can be built from. The
 * schema itself lives in the domain barrel so this module stays import-free for
 * the startup scripts that read the catalog.
 */
export const AGENT_TOOL_NAME_VALUES = [
	...TOOL_DESCRIPTIONS.map((entry) => entry.name),
	'search_tools'
] as const;

/** The {@link ToolName} values, for the same reason as {@link AGENT_TOOL_NAME_VALUES}. */
export const TOOL_NAME_VALUES: readonly ToolName[] = TOOL_DESCRIPTIONS.map((entry) => entry.name);

const AGENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>(AGENT_TOOL_NAME_VALUES);

/** Reads a foreign tool name into the agent surface, or reports that it is not one. */
export const readAgentToolName = (value: string): AgentToolName | undefined =>
	AGENT_TOOL_NAMES.has(value) ? (value as AgentToolName) : undefined;

const TOOL_NAMES: ReadonlySet<string> = new Set<string>(TOOL_NAME_VALUES);

/**
 * Reads a foreign name into the catalog, or reports that it is not one.
 *
 * Narrower than {@link readAgentToolName} by exactly `search_tools`, for
 * callers that need a tool bound to a controller method — an approval park, for
 * one: `search_tools` is a read and never parks.
 */
export const readToolName = (value: string): ToolName | undefined =>
	TOOL_NAMES.has(value) ? (value as ToolName) : undefined;

/**
 * The on-demand catalog surfaced through search_tools: everything but
 * first-class tools.
 *
 * The `name: ToolName` intersection is what keeps the literal names the const
 * assertion above earned. A plain `readonly ToolCatalogEntry[]` annotation
 * widened every entry's name back to `string`, so a caller could not test one
 * against the catalog without widening its own type to match.
 * {@link ToolCatalogEntry} itself cannot declare `name: ToolName`, because
 * {@link ToolName} is derived from the descriptions that satisfy it.
 *
 * Its element type stays {@link ToolName} rather than {@link LongTailToolName}:
 * `filter` cannot prove the partition, so narrowing it would take a
 * hand-written type predicate — an unchecked claim, which is the thing this
 * effort removes. `tool-catalog.spec.ts` holds the partition at runtime.
 */
export const TOOL_CATALOG: readonly (ToolCatalogEntry & { readonly name: ToolName })[] =
	TOOL_DESCRIPTIONS.filter((entry) => !FIRST_CLASS_TOOL_SET.has(entry.name));

/** Looks up a tool description; throws if the catalog and definitions drift apart. */
export const toolDescription = (name: string): string => {
	const entry = TOOL_DESCRIPTIONS.find((candidate) => candidate.name === name);
	if (!entry) throw new Error(`Tool description missing from catalog: ${name}`);
	return entry.description;
};

export const LOCKED_TOOL_NAMES = [
	'get_workspace_context',
	'load_skill',
	'list_tool_preferences',
	'set_tool_enabled'
] as const satisfies readonly ToolName[];
