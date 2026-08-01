/**
 * Built-in skill content. Definitions are data only — provisioning logic lives
 * in provisioning.ts.
 *
 * Retired versions below are kept verbatim so an install that still holds the
 * old text can be recognised as unmodified and upgraded. Never edit a retired
 * body: editing it strands the users it was meant to identify.
 */

export interface BuiltInSkillDefinition {
	readonly key: string;
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	readonly triggerHints: readonly string[];
	readonly allowImplicitInvocation: boolean;
	readonly version?: string;
}

const FOLLOWTHROUGH_V1: BuiltInSkillDefinition = {
	key: 'followthrough',
	name: 'FollowThrough',
	description: 'Discover and use FollowThrough actions safely.',
	instructions: `Use FollowThrough as an action-oriented workbench.

Discover the available action tools before answering. Prefer read tools to inspect current state, proposal tools for AI-generated suggestions, and mutation tools only when the requested execution mode permits them. Load other skills lazily when their summaries or trigger hints match the request. Keep AI-generated proposals reviewable and preserve provenance.`,
	triggerHints: ['create', 'update', 'organize', 'plan', 'follow through'],
	allowImplicitInvocation: true
};

const FOLLOWTHROUGH_V2: BuiltInSkillDefinition = {
	key: 'followthrough',
	name: 'FollowThrough',
	description:
		'Guide to FollowThrough features, terminology, navigation, workflows, and agent actions.',
	instructions: `# FollowThrough guide

Use this guide to explain the product, interpret FollowThrough terminology, navigate the workspace, and help the user choose or carry out the right workflow. For general product questions, answer from this guide. For questions about the user's actual workspace, inspect current data before answering.

## Product model

FollowThrough is a connected workbench for turning source material into durable knowledge, commitments, and deliverables.

- **Projects** organize notes, folders, todos, memory, attachments, and generated artifacts around an outcome.
- **Notes** are the authored source of truth. They contain rich text and can connect to todos, references, relationships, diagrams, and AI suggestions.
- **Todos** are explicit commitments. They can belong to the user or be marked as waiting on someone, carry dates and status, and link back to their source note.
- **Memory** is durable context shared with the agent. Profile memory describes the user across projects; project memory records project-specific facts, decisions, constraints, terminology, and preferences. Memory changes are proposed for review rather than silently rewritten.
- **Suggestions** are reviewable AI-produced changes. Depending on the workflow and trust policy, they can be accepted, rejected, reverted, or sometimes auto-accepted while remaining visibly AI-originated.
- **Provenance** records where AI-produced work came from, including its source selection, run, model, and pipeline.
- **Skills** are reusable methods and instructions. Their summaries are advertised first; full instructions load only when relevant. Skills can be enabled, disabled, versioned, and pinned to projects.
- **Attachments** are uploaded project or note resources. Parsed content can be searched, while the original file remains downloadable.
- **Diagrams** can start as Mermaid and, after review, become editable draw.io diagrams.
- **Artifacts** are generated deliverables such as PDF or DOCX files. They can be downloaded, regenerated, or removed without changing their source notes.
- **Execution mode** controls whether agent mutations require approval or can run immediately. **Trust policies** separately control auto-acceptance for specific proposal pipelines.

## Where work happens

- **Today** at "/today" is the daily triage view for overdue work, work due today, waiting-on items, pinned notes, and recent notes.
- **Projects** are opened from the sidebar at "/projects/{projectId}". A project hub contains its note tree and links to project Todos, Memory, Attachments, and Artifacts.
- **Notes** live at "/notes/{noteId}". Use the editor for source material and the selection actions to extract promises, find relationships or references, create diagrams, or turn a method into a skill. Note changes autosave; publishing records a durable revision.
- **Todos** at "/todos" show commitments across projects. Project-specific todos live at "/projects/{projectId}/todos". Use them to review status, due dates, responsibility, waiting-on parties, and source notes.
- **Profile** at "/profile" manages cross-project user memory. Project memory lives at "/projects/{projectId}/memory".
- **Attachments** live at "/projects/{projectId}/attachments". Upload source files there when they should be searchable without becoming authored notes.
- **Artifacts** live at "/artifacts", optionally filtered by project. Use them for generated deliverables and their downloads.
- **Skills** at "/skills" list reusable methods; "/skills/{noteId}" shows a skill's instructions, resources, versions, settings, and usage history.
- **Chats** at "/chats", "/chats/new", and "/chats/{conversationId}" provide durable conversations. A chat can originate from a project or note and can carry additional context.
- **Settings** at "/settings" controls agent defaults, execution mode, and pipeline-specific trust policies.

## Agent operating workflow

1. Use get_workspace_context to discover projects, note IDs, enabled skills, and pending work when the relevant identity or location is unknown.
2. Use get_note when a known note's authoritative content and related items matter.
3. Use list_todos, user or project memory, and semantic search when those sources could ground the answer. Prefer parallel independent reads and focused follow-up searches.
4. Load an advertised skill when its method applies.
5. For any capability not already available, call search_tools with the concrete goal. Read the returned schema and call use_tool with the exact name and a matching payload. Never guess tool names or inputs.
6. Inspect before changing. Keep proposals reviewable, respect approval requirements for mutations, and explain failures or rejected actions.

When advising the user, name both the place in the interface and what the agent can help do. Distinguish existing workspace facts from general product guidance. Do not claim that a feature, route, or action exists unless this guide or the available tools support it.

## Common workflows

- **Set up a project:** create or open the project, organize source notes and folders, add attachments, record durable constraints in project memory, and track commitments as todos.
- **Turn notes into action:** read or select the relevant passage, extract proposed promises, review them, and manage accepted work from the global or project todo view.
- **Recover prior knowledge:** inspect the workspace, search semantically, read the strongest source notes, and combine those findings with applicable memory.
- **Reuse a method:** capture stable instructions as a skill, add resources when needed, and pin it to projects where it should be preferred.
- **Produce a deliverable:** select the source notes, generate a PDF or DOCX artifact, then manage the resulting file from Artifacts.`,
	triggerHints: [
		'FollowThrough',
		'how to',
		'where',
		'help',
		'workflow',
		'project',
		'note',
		'todo',
		'memory',
		'suggestion',
		'provenance',
		'skill',
		'chat',
		'attachment',
		'artifact',
		'export'
	],
	allowImplicitInvocation: true,
	version: '2'
};

const FOLLOWTHROUGH_V3: BuiltInSkillDefinition = {
	key: 'followthrough',
	name: 'FollowThrough',
	description:
		'Load before answering anything about how FollowThrough itself works — its features, terminology, routes, navigation, workflows, settings, and what the agent can do in it.',
	instructions: `# FollowThrough guide

Use this guide to explain the product, interpret FollowThrough terminology, navigate the workspace, and help the user choose or carry out the right workflow. For general product questions, answer from this guide. For questions about the user's actual workspace, inspect current data before answering.

## Product model

FollowThrough is a connected workbench for turning source material into durable knowledge, commitments, and deliverables.

- **Projects** organize notes, folders, todos, memory, attachments, and generated artifacts around an outcome.
- **Notes** are the authored source of truth. They contain rich text and can connect to todos, references, relationships, diagrams, and AI suggestions.
- **Todos** are explicit commitments. They can belong to the user or be marked as waiting on someone, carry dates and status, and link back to their source note.
- **Memory** is durable context shared with the agent. Profile memory describes the user across projects; project memory records project-specific facts, decisions, constraints, terminology, and preferences. Memory changes are proposed for review rather than silently rewritten.
- **Suggestions** are reviewable AI-produced changes. Depending on the workflow and trust policy, they can be accepted, rejected, reverted, or sometimes auto-accepted while remaining visibly AI-originated.
- **Provenance** records where AI-produced work came from, including its source selection, run, model, and pipeline.
- **Skills** are reusable methods and instructions. Their summaries are advertised first; full instructions load only when relevant. Skills can be enabled, disabled, versioned, and pinned to projects.
- **Attachments** are uploaded project or note resources. Parsed content can be searched, while the original file remains downloadable.
- **Diagrams** can start as Mermaid and, after review, become editable draw.io diagrams.
- **Artifacts** are generated deliverables such as PDF or DOCX files. They can be downloaded, regenerated, or removed without changing their source notes.
- **Execution mode** controls whether agent mutations require approval or can run immediately. **Trust policies** separately control auto-acceptance for specific proposal pipelines.

## Where work happens

- **Today** at "/today" is the daily triage view for overdue work, work due today, waiting-on items, pinned notes, and recent notes.
- **Projects** are opened from the sidebar at "/projects/{projectId}". A project hub contains its note tree and links to project Todos, Memory, Attachments, and Artifacts.
- **Notes** live at "/notes/{noteId}". Use the editor for source material and the selection actions to extract promises, find relationships or references, create diagrams, or turn a method into a skill. Note changes autosave; publishing records a durable revision.
- **Todos** at "/todos" show commitments across projects. Project-specific todos live at "/projects/{projectId}/todos". Use them to review status, due dates, responsibility, waiting-on parties, and source notes.
- **Profile** at "/profile" manages cross-project user memory. Project memory lives at "/projects/{projectId}/memory".
- **Attachments** live at "/projects/{projectId}/attachments". Upload source files there when they should be searchable without becoming authored notes.
- **Artifacts** live at "/artifacts", optionally filtered by project. Use them for generated deliverables and their downloads.
- **Skills** at "/skills" list reusable methods; "/skills/{noteId}" shows a skill's instructions, resources, versions, settings, and usage history.
- **Chats** at "/chats", "/chats/new", and "/chats/{conversationId}" provide durable conversations. A chat can originate from a project or note and can carry additional context.
- **Settings** at "/settings" controls agent defaults, execution mode, MCP access tokens, and pipeline-specific trust policies. Load the Settings skill before explaining or changing anything there.

## Agent operating workflow

1. Use get_workspace_context to discover projects, note IDs, enabled skills, and pending work when the relevant identity or location is unknown.
2. Use get_note when a known note's authoritative content and related items matter.
3. Use list_todos, user or project memory, and semantic search when those sources could ground the answer. Prefer parallel independent reads and focused follow-up searches.
4. Load an advertised skill when its method applies.
5. For any capability not already available, call search_tools with the concrete goal. Read the returned schema and call use_tool with the exact name and a matching payload. Never guess tool names or inputs.
6. Inspect before changing. Keep proposals reviewable, respect approval requirements for mutations, and explain failures or rejected actions.

Changing a setting works the same way: no settings tool is offered up front, so call search_tools for the setting you need and then use_tool. Read the Settings skill first so you change the right one.

When advising the user, name both the place in the interface and what the agent can help do. Distinguish existing workspace facts from general product guidance. Do not claim that a feature, route, or action exists unless this guide or the available tools support it.

## Common workflows

- **Set up a project:** create or open the project, organize source notes and folders, add attachments, record durable constraints in project memory, and track commitments as todos.
- **Turn notes into action:** read or select the relevant passage, extract proposed promises, review them, and manage accepted work from the global or project todo view.
- **Recover prior knowledge:** inspect the workspace, search semantically, read the strongest source notes, and combine those findings with applicable memory.
- **Reuse a method:** capture stable instructions as a skill, add resources when needed, and pin it to projects where it should be preferred.
- **Produce a deliverable:** select the source notes, generate a PDF or DOCX artifact, then manage the resulting file from Artifacts.`,
	triggerHints: [
		'FollowThrough',
		'how to',
		'where',
		'help',
		'workflow',
		'project',
		'note',
		'todo',
		'memory',
		'suggestion',
		'provenance',
		'skill',
		'chat',
		'attachment',
		'artifact',
		'export'
	],
	allowImplicitInvocation: true,
	version: '3'
};

const SETTINGS_V1: BuiltInSkillDefinition = {
	key: 'settings',
	name: 'Settings',
	description:
		'Load before explaining or changing any FollowThrough setting: default model, execution mode, inline suggestions, trust policies, MCP tokens, or document export defaults.',
	instructions: `# FollowThrough settings

Everything on "/settings" belongs to the signed-in user and applies across projects unless stated otherwise. The page has three tabs, selected by query string: "/settings?tab=agent", "?tab=mcp", "?tab=policies". Read the current value before changing it, and tell the user what changed and where they can see it.

## Agent tab

- **Default chat model.** The model a new conversation uses when it has no override. Only models that support tool calling can be selected; anything else is rejected as unavailable. Clearing it falls back to the app default.
- **Inline writing suggestions.** Grounded ghost text while writing notes. On by default.
- **Default execution mode.** "approval_required" pauses every durable agent change for review. "auto_accept" applies agent changes immediately.

A single conversation can override the model from the agent settings popover in chat without changing this default.

## MCP access tab

FollowThrough exposes an MCP endpoint at "/mcp" for external clients such as Claude Desktop. Clients authenticate with a bearer token that begins with "ftm_" and acts as the user.

- **read** scope exposes only read tools. It cannot change anything, even by name.
- **full** scope exposes the same tools the in-app agent has.

Tokens are stored hashed. The plaintext is shown once, at creation, and is unrecoverable — a lost token has to be revoked and replaced. Minting is a deliberate action in the interface; the agent lists and revokes tokens but never creates one. Revoking takes effect immediately and breaks any client still using that token, so confirm which token is meant before revoking.

## Trust policies tab

Execution mode and trust policies are different controls and are often confused. Execution mode gates whether the **agent may make a change at all**. A trust policy gates whether a **proposal from one pipeline is accepted without review**.

There are five pipelines: "extract_promises" (commitments found in notes), "relate" (backlinks between notes), "reference" (external references for a selection), "agent" (changes proposed in chat), and "memory" (durable facts). Each is either review-first or auto-accept, with an optional minimum confidence expressed as a whole number from 0 to 100. Below that confidence the suggestion still waits for review.

"reference" never auto-accepts, whatever its policy says. Auto-accepted items stay visibly AI-made and are one action to revert.

## Document export settings

Export defaults are per project rather than per user, and live with the deliverables UI rather than on "/settings": font family ("helvetica", "times", "courier"), font size 8–18, line height 1.0–2.2, and margin 18–144 points. They apply to generated PDF and DOCX artifacts.

## Changing settings from chat

None of these tools are offered up front. Call search_tools with the setting you want, then use_tool with the exact name returned and a matching payload.

- Read agent defaults: get_agent_preferences. Change them: update_agent_preferences — send only the fields you are changing; omitted fields keep their current value.
- List selectable models: list_agent_models.
- Read trust policies: list_trust_policies. Change one: update_trust_policy, with minimumConfidence as 0–100.
- List MCP tokens: list_api_tokens. Revoke one: revoke_api_token. There is no tool that creates one — send the user to "/settings?tab=mcp".
- Read project export defaults: get_export_settings. Change them: update_export_settings.
- Turn a skill on or off, or rename its summary: update_skill. Pin or unpin a skill for a project: set_skill_pinned. Pinned skills lead the catalogue the agent sees.

Every one of these is a mutation, so under "approval_required" the user approves it before it takes effect.`,
	triggerHints: [
		'settings',
		'preferences',
		'default model',
		'execution mode',
		'approval',
		'auto-accept',
		'trust policy',
		'inline suggestions',
		'MCP',
		'API token',
		'export defaults'
	],
	allowImplicitInvocation: true,
	version: '1'
};
const DIAGRAMMING: BuiltInSkillDefinition = {
	key: 'diagramming',
	name: 'Diagramming',
	description: 'Turn source material into clear, valid Mermaid diagrams.',
	instructions: `Create or revise Mermaid diagrams from the supplied material.

Infer the relationships that matter before choosing a diagram family. Use flowcharts for processes and dependency maps, sequence diagrams for ordered interactions, state diagrams for lifecycle transitions, class diagrams for stable structures, and other Mermaid families only when they communicate the material more clearly.

Preserve uncertainty and do not invent systems, people, steps, or dependencies that the source does not support. Prefer a small coherent diagram over an exhaustive one. Use concise, readable labels and stable identifiers. When revising, preserve correct information and change only what the instruction requires.

Inspect relevant project notes, memories, profile context, or attachments when they are available and useful. Finish by calling submit_mermaid_diagram exactly once with valid Mermaid source and an optional concise title. Do not wrap the source in Markdown fences and do not use click handlers, links, initialization directives, or HTML labels. For multi-line node and edge labels, use escaped \\n inside quoted labels instead of HTML tags such as <br/>.`,
	triggerHints: ['diagram', 'mermaid', 'visualize', 'flowchart', 'sequence', 'architecture'],
	allowImplicitInvocation: false
};

export const BUILT_INS: readonly BuiltInSkillDefinition[] = [
	FOLLOWTHROUGH_V3,
	SETTINGS_V1,
	DIAGRAMMING
];

/** Superseded bodies, matched to detect installs the user never edited. */
export const RETIRED_BUILT_INS: readonly BuiltInSkillDefinition[] = [
	FOLLOWTHROUGH_V1,
	FOLLOWTHROUGH_V2
];
