import { ProjectChoiceRequiredError } from '$lib/errors';
import type { NoteId } from '$lib/models/notes';
import type {
	MoveProjectEntryInput,
	Project,
	ProjectDetails,
	ProjectEntryReference
} from '$lib/models/projects';

export interface ProjectChoiceRules {
	/** Fails an operation that needs a project, naming every project the caller can choose. */
	requireChoice(projects: readonly Project[], action: string): never;
}

type ProjectDetailDecision =
	{ kind: 'invalid'; message: string } | ({ kind: 'details' } & ProjectDetails);

export interface ProjectDetailRules {
	decideDetails(input: {
		readonly name: string;
		readonly description?: string;
	}): ProjectDetailDecision;
}

type PlacementEntry = Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind' | 'position'>;

/** A move rewrites both sibling lists while preserving their existing relative order. */
function decideProjectEntryMove<Entry extends PlacementEntry>(
	input: MoveProjectEntryInput,
	entries: readonly Entry[]
):
	| { kind: 'invalid'; code: 'VALIDATION' | 'NOT_FOUND'; message: string }
	| {
			kind: 'move';
			entry: Entry;
			parentId: NoteId | undefined;
			position: number;
			changes: readonly {
				readonly id: NoteId;
				readonly parentId: NoteId | undefined;
				readonly position: number;
			}[];
	  } {
	if (!Number.isInteger(input.position) || input.position < 0)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: 'Entry position must be a non-negative integer'
		};
	const entry = entries.find((candidate) => candidate.id === input.entryId);
	if (!entry) return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
	if (input.parentId === entry.id)
		return { kind: 'invalid', code: 'VALIDATION', message: 'An entry cannot parent itself' };
	if (input.parentId) {
		const parent = entries.find((candidate) => candidate.id === input.parentId);
		if (!parent)
			return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
		if (parent.kind !== 'folder')
			return { kind: 'invalid', code: 'VALIDATION', message: 'A parent must be a folder' };
		let cursor: NoteId | undefined = input.parentId;
		while (cursor) {
			if (cursor === entry.id)
				return {
					kind: 'invalid',
					code: 'VALIDATION',
					message: 'An entry cannot move below its descendant'
				};
			const ancestor = entries.find((candidate) => candidate.id === cursor);
			if (!ancestor)
				return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
			cursor = ancestor.parentId;
		}
	}
	const oldSiblings = entries
		.filter((candidate) => candidate.parentId === entry.parentId && candidate.id !== entry.id)
		.sort((left, right) => left.position - right.position);
	const targetSiblings = (
		entry.parentId === input.parentId
			? oldSiblings
			: entries
					.filter((candidate) => candidate.parentId === input.parentId && candidate.id !== entry.id)
					.sort((left, right) => left.position - right.position)
	).slice();
	// Tree callers count visible notes and folders. Hidden skill records still need
	// their persisted slots, but must not shift a requested visible position.
	// Preserve the existing full-sibling semantics for direct skill moves.
	const positionedSiblings =
		entry.kind === 'skill'
			? targetSiblings
			: targetSiblings.filter((sibling) => sibling.kind !== 'skill');
	const before = positionedSiblings[input.position];
	const targetIndex = before ? targetSiblings.indexOf(before) : targetSiblings.length;
	targetSiblings.splice(targetIndex, 0, entry);
	return {
		kind: 'move',
		entry,
		parentId: input.parentId,
		position: targetSiblings.indexOf(entry),
		changes: [
			...(entry.parentId === input.parentId
				? []
				: oldSiblings.map((sibling, position) => ({
						id: sibling.id,
						parentId: entry.parentId,
						position
					}))),
			...targetSiblings.map((sibling, position) => ({
				id: sibling.id,
				parentId: input.parentId,
				position
			}))
		]
	};
}

export interface ProjectPlacement {
	decideMove<Entry extends PlacementEntry>(
		input: MoveProjectEntryInput,
		entries: readonly Entry[]
	): ReturnType<typeof decideProjectEntryMove<Entry>>;
}

/** Project rules shared by browser and server: choosing, naming and placing. */
export class ProjectRules implements ProjectChoiceRules, ProjectDetailRules, ProjectPlacement {
	requireChoice(projects: readonly Project[], action: string): never {
		// One project is still a choice: picking it silently would write somewhere the caller never named.
		throw new ProjectChoiceRequiredError(
			action,
			projects.map((project) => ({ id: project.id, name: project.name }))
		);
	}

	decideDetails(input: {
		readonly name: string;
		readonly description?: string;
	}): ProjectDetailDecision {
		const name = input.name.trim();
		return name
			? { kind: 'details', name, description: input.description?.trim() || undefined }
			: { kind: 'invalid', message: 'Project name is required' };
	}

	decideMove<Entry extends PlacementEntry>(
		input: MoveProjectEntryInput,
		entries: readonly Entry[]
	) {
		return decideProjectEntryMove(input, entries);
	}
}
