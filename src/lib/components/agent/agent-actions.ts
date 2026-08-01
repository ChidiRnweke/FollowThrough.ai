import type { Component } from 'svelte';
import {
	FtArtifacts,
	FtDocument,
	FtLink,
	FtMemory,
	FtSettings,
	FtSkills,
	FtSuggestion,
	FtTodos,
	FtWorkflow
} from '$lib/components/icons';

/**
 * The agent's invocation points: one prompt per screen, written where it applies.
 *
 * The agent is the app's most capable and least visible feature. Nothing on a
 * normal screen says what it can do, so nobody learns it. These entries are that
 * lesson — placed in the screen they act on, opening the chat with the sentence
 * already written so the user reads what is being asked before anything runs.
 *
 * Every prompt is anchored in notes, because that is what this app is. Todos,
 * memory, attachments and artifacts are not peers of notes: memory and
 * attachments are context that makes the notes better, todos are distilled *from*
 * notes, artifacts are notes exported. So each prompt does one of four things —
 * write a note, distil todos from notes, distil context from notes, or ask about
 * notes. General-assistant prompts ("plan my day", "triage my todos") are
 * deliberately absent: they are a different product, and a vague verb like
 * "organise" teaches nothing because it names no result.
 *
 * The copy follows `chat-starters.ts`: an imperative naming an action, never a
 * plain question. `label` is what the button says and stays under 22 characters
 * so it never wraps inside an action cluster; `prompt` is what lands in the
 * composer and stays under 55 so a `row` stays on one line in the docked panel.
 */
export interface AgentActionSpec {
	readonly label: string;
	readonly prompt: string;
	/** What the action will change. Drives the icon, so a row reads as a destination. */
	readonly icon: Component<{ class?: string }>;
}

export type AgentActionKey =
	| 'today'
	| 'todosFromNotes'
	| 'todoSource'
	| 'projectConnect'
	| 'projectDistil'
	| 'projectAttachments'
	| 'artifactsExport'
	| 'note'
	| 'noteCompare'
	| 'selection'
	| 'diagram'
	| 'skills'
	| 'skillDetail'
	| 'profile'
	| 'settings';

export const agentActions: Record<AgentActionKey, AgentActionSpec> = {
	today: {
		label: 'Write a note',
		prompt: 'Interview me and write it up as a note',
		icon: FtDocument
	},
	/**
	 * The thesis made visible, and the reason this one appears on a full board as
	 * well as an empty one: the notes already hold the todos the board is missing.
	 */
	todosFromNotes: {
		label: 'Find todos in my notes',
		prompt: 'Read my notes and propose the todos they imply',
		icon: FtTodos
	},
	todoSource: {
		label: 'Find the source',
		prompt: 'Find the note this todo came from and what it says',
		icon: FtDocument
	},
	/**
	 * Names its output rather than a mood. What comes back is backlink suggestions
	 * — the same reviewable objects the `relate` pipeline already produces, which
	 * you accept or dismiss.
	 */
	projectConnect: {
		label: 'Connect these notes',
		prompt: 'Find notes here that relate and propose backlinks',
		icon: FtLink
	},
	projectDistil: {
		label: 'Distil memory',
		prompt: 'Read my notes here and propose what to remember',
		icon: FtMemory
	},
	projectAttachments: {
		label: 'Write from these files',
		prompt: 'Read these attachments and write up a note',
		icon: FtDocument
	},
	artifactsExport: {
		label: 'Export these notes',
		prompt: "Create an artifact from this project's notes",
		icon: FtArtifacts
	},
	note: {
		label: 'Ask about this note',
		prompt: 'Review this note and tell me what it commits me to',
		icon: FtSuggestion
	},
	noteCompare: {
		label: 'Compare',
		prompt: 'Compare the open notes and say where each idea belongs',
		icon: FtDocument
	},
	selection: {
		label: 'Ask about this',
		prompt: 'Explain the selected text and what to do with it',
		icon: FtSuggestion
	},
	diagram: {
		label: 'Explain this diagram',
		prompt: 'Explain this diagram and what it is missing',
		icon: FtWorkflow
	},
	skills: {
		label: 'Draft a skill',
		prompt: 'Draft a skill from how I write my notes',
		icon: FtSkills
	},
	skillDetail: {
		label: 'Improve this skill',
		prompt: 'Review this skill and propose a sharper version',
		icon: FtSkills
	},
	profile: {
		label: 'Distil my profile',
		prompt: 'Read my notes and propose what to remember about me',
		icon: FtMemory
	},
	settings: {
		label: 'Explain these',
		prompt: 'Explain what these agent settings change',
		icon: FtSettings
	}
};
