import type { EntityKind, EntityRef } from '$lib/models/tool-display';
import type { ShellContext } from '$lib/models/workspace';
import { toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';
import { noteTitle } from '../../chat/actions/tool-approval-fields';
import { toolResultFields, type ToolResultFields } from './tool-result-fields';
import { toolPresentationKind } from './tool-catalog-presentation';

const placeholder: Readonly<Record<EntityKind, string>> = {
	note: 'A note',
	folder: 'A folder',
	attachment: 'An attachment',
	todo: 'A todo',
	project: 'A project',
	skill: 'A skill',
	diagram: 'A diagram',
	artifact: 'A file',
	memory: 'A remembered fact',
	suggestion: 'A suggestion',
	setting: 'A setting',
	plain: 'An item'
};
const identify = (fields: ToolResultFields, kind: EntityKind): string | undefined => {
	switch (kind) {
		case 'note':
		case 'skill':
		case 'folder':
			return fields.noteId ?? fields.entryId ?? fields.id;
		case 'todo':
			return fields.todoId ?? fields.id;
		case 'project':
			return fields.projectId ?? fields.id;
		case 'diagram':
			return fields.diagramId ?? fields.id;
		case 'artifact':
			return fields.artifactId ?? fields.id;
		case 'attachment':
			return fields.attachmentId ?? fields.id;
		case 'suggestion':
			return fields.suggestionId ?? fields.id;
		default:
			return undefined;
	}
};
const nameIn = (fields: ToolResultFields): string | undefined =>
	fields.title ??
	fields.name ??
	fields.fileName ??
	fields.filename ??
	fields.label ??
	fields.toolName ??
	fields.pipeline;

function destinationOf(kind: EntityKind, fields: ToolResultFields): EntityRef['destination'] {
	const artifactId = fields.artifactId ?? fields.id;
	if (kind === 'artifact' && artifactId) return { kind: 'download', artifactId };
	if (kind === 'suggestion' && fields.noteId) return { kind: 'note', noteId: fields.noteId };
	if (kind === 'folder' && fields.projectId)
		return {
			kind: 'page',
			href: `/projects/${fields.projectId}`,
			label: 'Open containing project'
		};
	if (kind === 'attachment' && fields.projectId)
		return {
			kind: 'page',
			href: `/projects/${fields.projectId}/attachments`,
			label: 'Open project attachments'
		};
	if (kind === 'memory' && fields.projectId)
		return {
			kind: 'page',
			href: `/projects/${fields.projectId}/memory`,
			label: 'Open project memory'
		};
	if (kind === 'setting') return { kind: 'page', href: '/settings', label: 'Open settings' };
	return undefined;
}

/** Identity is specific to the entity kind, never the first ID found on a payload. */
export function entityFrom(value: AgentPayload, kind: EntityKind, shell?: ShellContext): EntityRef {
	if (!isAgentPayloadObject(value)) {
		const title = typeof value === 'string' ? value : undefined;
		return { kind, title: title ?? placeholder[kind], named: title !== undefined };
	}
	const fields = toolResultFields(value);
	if (kind === 'note' && (fields.kind === 'folder' || fields.kind === 'skill')) kind = fields.kind;
	const id = identify(fields, kind);
	const payload = isAgentPayloadObject(value.payload) ? toolResultFields(value.payload) : undefined;
	const shellTitle = ['note', 'skill', 'folder'].includes(kind)
		? noteTitle(shell, id)
		: kind === 'project'
			? shell?.projects.find((project) => project.id === id)?.name
			: undefined;
	const title =
		nameIn(fields) ??
		shellTitle ??
		(payload ? (nameIn(payload) ?? payload.content) : undefined) ??
		fields.content ??
		(kind === 'attachment' ? fields.path : undefined);
	const destination = destinationOf(kind, {
		...fields,
		projectId: fields.projectId ?? shell?.noteTree.find((note) => note.id === id)?.projectId
	});
	return {
		kind,
		...(id ? { id } : {}),
		title: title ?? placeholder[kind],
		named: title !== undefined,
		...(destination ? { destination } : {})
	};
}

/** Reused by the call log and the turn summary. Newly created targets come from the receipt. */
export function toolEntity(tool: ChatToolActivity, shell?: ShellContext): EntityRef {
	const kind = toolPresentationKind(tool.name)?.kind ?? 'plain';
	const output = toolOutput(tool);
	const returned = output !== undefined && isAgentPayloadObject(output) ? output : undefined;
	if (
		tool.name === 'accept_suggestion' &&
		returned &&
		isAgentPayloadObject(returned.suggestion) &&
		isAgentPayloadObject(returned.artifact)
	) {
		const appliedKind = returned.suggestion.kind;
		if (appliedKind === 'todo' || appliedKind === 'diagram' || appliedKind === 'memory')
			return entityFrom(returned.artifact, appliedKind, shell);
	}
	if (tool.name === 'promote_diagram' && returned && isAgentPayloadObject(returned.source))
		return entityFrom(returned.source, 'diagram', shell);
	if (
		tool.name === 'propose_memory_change' &&
		returned &&
		isAgentPayloadObject(returned.appliedEntry)
	)
		return entityFrom(returned.appliedEntry, 'memory', shell);
	if (tool.name === 'delete_note_forever' && returned) {
		const target = (agentPayloadItems(returned.deletedNotes) ?? []).find(
			(row) => isAgentPayloadObject(row) && row.id === tool.arguments.noteId
		);
		if (target && isAgentPayloadObject(target) && typeof target.title === 'string')
			return { kind: 'note', title: target.title, named: true };
	}
	const entity = entityFrom(
		returned ? { ...tool.arguments, ...returned } : tool.arguments,
		kind,
		shell
	);
	if (
		tool.status === 'succeeded' &&
		['delete_note_forever', 'delete_artifact', 'revoke_api_token'].includes(tool.name)
	)
		return { kind: entity.kind, title: entity.title, named: entity.named };
	const settings: Readonly<Record<string, readonly [string, string]>> = {
		get_agent_preferences: ['Agent settings', 'agents'],
		update_agent_preferences: ['Agent settings', 'agents'],
		get_export_settings: ['Export settings', 'documents'],
		update_export_settings: ['Export settings', 'documents'],
		set_tool_enabled: ['Tool availability', 'tools'],
		update_trust_policy: ['Trust policy', 'policies']
	};
	const setting = settings[tool.name];
	if (setting)
		return {
			...entity,
			title: entity.named ? entity.title : setting[0],
			named: true,
			destination: {
				kind: 'page',
				href: `/settings?tab=${setting[1]}`,
				label: `Open ${setting[0].toLowerCase()}`
			}
		};
	return entity;
}

/** Stable virtual paths keep source navigation available outside the current note tree. */
export function fileEntity(path: string, shell?: ShellContext): EntityRef {
	const note = /^\/projects\/([^/]+)\/notes\/([^/]+?)(?:\/versions\/\d+)?\.md$/.exec(path);
	if (note) return entityFrom({ projectId: note[1], noteId: note[2] }, 'note', shell);
	const diagram = /^\/projects\/([^/]+)\/diagrams\/([^/.]+)(?:\.[^/]+)?$/.exec(path);
	if (diagram)
		return entityFrom({ projectId: diagram[1], diagramId: diagram[2] }, 'diagram', shell);
	const attachment = /^\/projects\/([^/]+)\/attachments\/([^/.]+)(?:\.[^/]+)?$/.exec(path);
	if (attachment)
		return entityFrom(
			{ projectId: attachment[1], attachmentId: attachment[2] },
			'attachment',
			shell
		);
	const directory = /^\/projects\/([^/]+)(?:\/(notes|diagrams|attachments))?\/?$/.exec(path);
	if (directory) {
		const project = shell?.projects.find((candidate) => candidate.id === directory[1]);
		const title = project?.name ?? 'Project';
		return {
			kind: 'project',
			id: directory[1],
			title: directory[2] ? `${title} / ${directory[2]}` : title,
			named: true
		};
	}
	return { kind: 'plain', title: path === '/' ? 'Workspace files' : path, named: true };
}
