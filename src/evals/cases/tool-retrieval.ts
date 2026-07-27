import { randomUUID } from 'node:crypto';
import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import type { ActorContext, UserId } from '$lib/models';
import { rankToolsForGoal } from '../lab/tool-catalog';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * No workspace is seeded: the catalog is built from static tool definitions and
 * ranked by embedding the descriptions, so nothing here reads user data. Seeding
 * per case would add a second of database work each to prove nothing.
 */
const catalogActor = (): ActorContext => ({ userId: randomUUID() as UserId });

/**
 * Coverage over the whole long-tail catalog, one goal per capability.
 *
 * `search_tools` is the only way the agent reaches a non-first-class tool, so if
 * the catalog cannot surface a tool for a plainly-worded goal, no amount of
 * model quality recovers it — the capability is simply unreachable. That failure
 * is invisible at the agent level, where it looks like the model "chose not to"
 * do something.
 *
 * These are deterministic and cheap: no agent turn, and embeddings replay from
 * the cache. Top-5 rather than top-1 because the agent is shown several
 * candidates with their schemas and picks among them, so rank 3 of 5 is a
 * success, not a near-miss.
 */

interface RetrievalGoal {
	readonly id: string;
	readonly goal: string;
	readonly expected: string;
}

const GOALS: readonly RetrievalGoal[] = [
	// Projects and structure
	{
		id: 'projects-create',
		goal: 'start a new project to organise this work',
		expected: 'create_project'
	},
	{
		id: 'projects-rename',
		goal: 'change the name of one of my projects',
		expected: 'rename_project'
	},
	{
		id: 'projects-archive',
		goal: 'get rid of a project I no longer use',
		expected: 'archive_project'
	},
	{
		id: 'projects-folder',
		goal: 'group these notes into a folder inside the project',
		expected: 'create_folder'
	},
	{
		id: 'projects-move',
		goal: 'move this note somewhere else in the tree',
		expected: 'move_project_entry'
	},
	{ id: 'projects-list', goal: 'what projects do I have', expected: 'list_projects' },
	{
		id: 'projects-get',
		goal: 'show me everything inside one particular project',
		expected: 'get_project'
	},

	// Notes
	{ id: 'notes-create', goal: 'start a new note to write this down', expected: 'create_note' },
	{ id: 'notes-save', goal: 'rewrite this whole note from scratch', expected: 'save_note' },
	{
		id: 'notes-edit-sentence',
		goal: 'change one sentence in this note and leave the rest alone',
		expected: 'edit_note'
	},
	{
		id: 'notes-edit-typo',
		goal: 'fix the typo in the second paragraph of my note',
		expected: 'edit_note'
	},
	{ id: 'notes-rename', goal: 'give this note a better title', expected: 'rename_note' },
	{ id: 'notes-archive', goal: 'remove a note I do not need any more', expected: 'archive_note' },
	{
		id: 'notes-publish',
		goal: 'publish this note as a versioned snapshot',
		expected: 'publish_note'
	},
	{
		id: 'notes-discard',
		goal: 'throw away my unpublished edits and go back',
		expected: 'discard_note_draft'
	},

	// Todos
	{ id: 'todos-create', goal: 'remind me to do this task', expected: 'create_todo' },
	{ id: 'todos-update', goal: 'mark that task as done', expected: 'update_todo' },
	{
		id: 'todos-extract',
		goal: 'find the commitments hidden in this paragraph',
		expected: 'extract_promises'
	},

	// Knowledge graph
	{ id: 'relate', goal: 'what other notes connect to this passage', expected: 'relate_selection' },
	{
		id: 'references',
		goal: 'find sources on the web backing up this claim',
		expected: 'find_references'
	},

	// Diagrams
	{
		id: 'diagram-generate',
		goal: 'draw a diagram of this architecture',
		expected: 'generate_mermaid_diagram'
	},
	{
		id: 'diagram-revise',
		goal: 'change the arrows in the existing diagram',
		expected: 'revise_mermaid_diagram'
	},
	{
		id: 'diagram-promote',
		goal: 'turn this mermaid chart into an editable draw.io file',
		expected: 'promote_diagram'
	},

	// Suggestions
	{
		id: 'suggestions-list',
		goal: 'what proposals are waiting for my review',
		expected: 'list_suggestions'
	},
	{ id: 'suggestions-accept', goal: 'apply that proposal', expected: 'accept_suggestion' },
	{
		id: 'suggestions-reject',
		goal: 'dismiss that proposal, it is wrong',
		expected: 'reject_suggestion'
	},
	{
		id: 'suggestions-revert',
		goal: 'undo the proposal I accepted earlier',
		expected: 'revert_suggestion'
	},

	// Skills
	{ id: 'skills-list', goal: 'which skills are available to you', expected: 'list_skills' },
	{
		id: 'skills-create',
		goal: 'save this workflow so you can reuse it later',
		expected: 'create_skill'
	},
	{ id: 'skills-get', goal: 'show me the details of one particular skill', expected: 'get_skill' },
	{
		id: 'skills-from-selection',
		goal: 'turn this highlighted procedure into a reusable skill',
		expected: 'create_skill_from_selection'
	},
	{
		id: 'skills-versions',
		goal: 'show the revision history of that skill',
		expected: 'list_skill_versions'
	},
	{
		id: 'skills-restore',
		goal: 'roll that skill back to the previous version',
		expected: 'restore_skill_version'
	},

	// Attachments
	{
		id: 'attachments-list',
		goal: 'what files are attached to this note',
		expected: 'list_attachments'
	},
	{
		id: 'attachments-read',
		goal: 'read the contents of the PDF I uploaded',
		expected: 'read_attachment'
	},

	// Note: the memory tools are first-class, so they are deliberately absent
	// here — the catalog excludes them and they are covered by invocation cases.

	// Trust and preferences
	{
		id: 'trust-list',
		goal: 'what automation am I currently trusting',
		expected: 'list_trust_policies'
	},
	{
		id: 'trust-update',
		goal: 'stop auto-applying that pipeline without asking me',
		expected: 'update_trust_policy'
	},
	{
		id: 'prefs-get',
		goal: 'which chat model am I defaulting to',
		expected: 'get_agent_preferences'
	},
	{
		id: 'prefs-update',
		goal: 'switch my default model to something faster',
		expected: 'update_agent_preferences'
	},
	{ id: 'models-list', goal: 'which models can I choose between', expected: 'list_agent_models' },

	// Documents and artifacts
	{
		id: 'export',
		goal: 'turn these notes into a Word document I can send',
		expected: 'export_document'
	},
	{
		id: 'artifacts-list',
		goal: 'what documents have already been generated',
		expected: 'list_artifacts'
	},
	{
		id: 'artifact-get',
		goal: 'show me the record for one generated document',
		expected: 'get_artifact'
	},
	{ id: 'templates-list', goal: 'which docx templates can I apply', expected: 'list_templates' },
	{
		id: 'export-settings-get',
		goal: 'what font and margins do exports use',
		expected: 'get_export_settings'
	},
	{
		id: 'export-settings-update',
		goal: 'make the exported documents use wider margins',
		expected: 'update_export_settings'
	},
	{
		id: 'artifact-download',
		goal: 'give me a link to download that generated file',
		expected: 'download_artifact'
	},
	{ id: 'artifact-delete', goal: 'delete that generated document', expected: 'delete_artifact' },
	{
		id: 'artifact-regenerate',
		goal: 'rebuild that document from its source notes',
		expected: 'regenerate_artifact'
	},

	// Time
	{ id: 'today', goal: 'what is due today', expected: 'get_today_view' }
];

const TOP_K = 5;

export const toolRetrievalCases: readonly EvalCase[] = GOALS.map((entry) => ({
	id: `tool-retrieval-${entry.id}`,
	name: `catalog surfaces ${entry.expected} for: ${entry.goal}`,
	splits: [ARCHETYPES.toolRetrieval],
	input: { goal: entry.goal, topK: TOP_K },
	expected: { tool: entry.expected },
	metadata: { layer: 'retriever', note: 'No agent turn; ranks the catalog directly.' },
	async run(lab) {
		const ranked = await rankToolsForGoal(lab, catalogActor(), entry.goal, TOP_K);

		const rank = ranked.indexOf(entry.expected);
		px.logOutput({ ranked, rank: rank === -1 ? null : rank + 1 });

		const hit = rank !== -1;
		px.logAnnotation({
			name: ARCHETYPES.toolRetrieval,
			score: hit ? 1 : 0,
			label: hit ? `rank_${rank + 1}` : 'miss',
			explanation: hit
				? `${entry.expected} ranked ${rank + 1} of ${TOP_K}`
				: `${entry.expected} absent from top ${TOP_K}; got ${ranked.join(', ')}`
		});

		expect(ranked, `expected ${entry.expected} in the top ${TOP_K}`).toContain(entry.expected);
	}
}));
