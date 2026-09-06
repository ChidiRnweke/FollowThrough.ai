import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';
import type { EntityRef } from '$lib/models/tool-display';
import type { ShellContext } from '$lib/models/workspace';
import { toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolDisclosure } from './tool-disclosure';
import { entityFrom, fileEntity, toolEntity } from './tool-entities';
import { toolPresentationKind } from './tool-catalog-presentation';
import { argumentLabel } from '../../chat/actions/tool-approval-fields';
const text = (value: AgentPayload | undefined): string | undefined =>
	typeof value === 'string' ? value : undefined;

export function toolRowContext(tool: ChatToolActivity, shell?: ShellContext): string {
	const input = tool.arguments;
	const lines: string[] = [];
	if (tool.name === 'grep') {
		const path = text(input.path);
		if (path) lines.push(`In ${fileEntity(path, shell).title}`);
		if (input.fixed === true) lines.push('Literal text');
		if (input.ignoreCase === true) lines.push('Ignoring case');
	}
	if (tool.name === 'sed' && tool.status !== 'succeeded' && isAgentPayloadObject(input.range)) {
		const range = input.range;
		lines.push(
			range.kind === 'to_end'
				? `From line ${range.startLine}`
				: `Lines ${range.startLine}–${range.endLine}`
		);
	}
	for (const key of [
		'today',
		'status',
		'responsibility',
		'createdAfter',
		'createdBefore',
		'format',
		'operation',
		'pipeline',
		'enabled',
		'pinned'
	]) {
		const value = input[key];
		if (
			toolPresentationKind(tool.name)?.family !== 'record' &&
			(typeof value === 'string' || typeof value === 'boolean')
		)
			lines.push(
				`${argumentLabel(key)}: ${typeof value === 'boolean' ? (value ? 'On' : 'Off') : value}`
			);
	}
	if (tool.name === 'move_project_entry') {
		const parentId = text(input.parentId);
		lines.push(
			parentId ? `To ${entityFrom({ noteId: parentId }, 'folder', shell).title}` : 'To project root'
		);
	}
	const output = toolOutput(tool);
	if (output !== undefined && isAgentPayloadObject(output)) {
		if (typeof output.appliedEdits === 'number')
			lines.push(`${output.appliedEdits} ${output.appliedEdits === 1 ? 'edit' : 'edits'}`);
		if (tool.name === 'empty_note_trash' || tool.name === 'delete_note_forever') {
			const deleted = agentPayloadItems(output.deletedNoteIds);
			if (deleted)
				lines.push(`${deleted.length} ${deleted.length === 1 ? 'note' : 'notes'} deleted`);
		}
		if (output.kind === 'empty') lines.push('Canvas empty');
		if (output.outcome === 'nothing_relevant') lines.push('No relevant references');
	}
	return lines.join(' · ');
}

export function toolRowTargets(
	tool: ChatToolActivity,
	disclosure: ToolDisclosure,
	shell?: ShellContext
): readonly EntityRef[] {
	let targets: readonly EntityRef[];
	switch (disclosure.kind) {
		case 'collection':
		case 'created':
			targets = disclosure.entities;
			break;
		case 'file-output':
			targets = disclosure.sources;
			break;
		case 'proposal':
			targets = proposalEntities(tool, shell);
			break;
		default: {
			const path = text(tool.arguments.path);
			const entity =
				path && ['sed', 'ls'].includes(tool.name)
					? fileEntity(path, shell)
					: toolEntity(tool, shell);
			targets = entity.id || entity.named ? [entity] : [];
		}
	}
	const output = toolOutput(tool);
	const source = output !== undefined && isAgentPayloadObject(output) ? output : undefined;
	const sourceNoteId = source ? text(source.sourceNoteId) : undefined;
	const noteId = text(tool.arguments.noteId);
	const projectId = text(tool.arguments.projectId);
	const context: EntityRef[] = [];
	if (sourceNoteId) context.push(entityFrom({ noteId: sourceNoteId }, 'note', shell));
	if (
		noteId &&
		[
			'search_note',
			'list_attachments',
			'list_note_versions',
			'list_skill_versions',
			'diff_note_versions'
		].includes(tool.name)
	)
		context.push(entityFrom({ noteId }, 'note', shell));
	if (projectId && !targets.some((target) => target.kind === 'project' && target.id === projectId))
		context.push(entityFrom({ projectId }, 'project', shell));
	for (const id of agentPayloadItems(tool.arguments.noteIds) ?? []) {
		if (typeof id === 'string') context.push(entityFrom({ noteId: id }, 'note', shell));
	}
	if (tool.name === 'empty_note_trash' && source)
		targets = (agentPayloadItems(source.deletedNotes) ?? []).map((note) => {
			const entity = entityFrom(note, 'note', shell);
			return { kind: entity.kind, title: entity.title, named: entity.named };
		});
	const all = [...targets, ...context];
	return all.filter(
		(target, index) =>
			all.findIndex(
				(other) =>
					other.kind === target.kind &&
					(target.id ? other.id === target.id : other.title === target.title)
			) === index
	);
}

function proposalEntities(tool: ChatToolActivity, shell?: ShellContext): readonly EntityRef[] {
	const output = toolOutput(tool);
	if (output === undefined || !isAgentPayloadObject(output)) return [];
	const todos = (agentPayloadItems(output.createdTodos) ?? []).map((item) =>
		entityFrom(item, 'todo', shell)
	);
	const suggestions = (agentPayloadItems(output.suggestions) ?? []).map((item) =>
		entityFrom(item, 'suggestion', shell)
	);
	if (todos.length || suggestions.length) return [...todos, ...suggestions];
	const entity = toolEntity(tool, shell);
	return entity.named ? [entity] : [];
}
export function toolRowHeadline(disclosure: ToolDisclosure): string {
	switch (disclosure.kind) {
		case 'collection':
			return disclosure.total === 0
				? 'No results'
				: disclosure.total > disclosure.entities.length
					? `${disclosure.entities.length} of ${disclosure.total} returned`
					: `${disclosure.total} ${disclosure.total === 1 ? 'result' : 'results'}`;
		case 'file-output':
			return disclosure.headline;
		case 'proposal':
			return disclosure.content
				? `${disclosure.operation ?? 'Proposed'}: ${disclosure.content}`
				: '';
		default:
			return '';
	}
}
