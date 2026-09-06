import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';
import type { EntityKind, EntityRef } from '$lib/models/tool-display';
import type { ShellContext } from '$lib/models/workspace';
import { toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { entityFrom } from './tool-entities';
import { friendlyToolLabel } from './tool-labels';
import type { ToolDisclosure } from './tool-disclosure';

/** Collection envelopes defined by the actual tool producers. Top-level arrays are also accepted. */
const collections: Readonly<Record<string, readonly string[]>> = {
	search: [],
	search_note: [],
	search_tools: [],
	list_projects: ['projects'],
	list_todos: ['todos'],
	list_trashed_notes: ['notes'],
	list_note_versions: ['revisions'],
	list_skill_versions: ['revisions'],
	list_skills: ['skills'],
	list_suggestions: ['suggestions'],
	list_attachments: ['attachments'],
	list_artifacts: ['artifacts'],
	list_templates: ['templates'],
	search_icons: ['icons'],
	list_agent_models: ['models'],
	list_api_tokens: ['tokens'],
	list_tool_preferences: [],
	list_trust_policies: ['policies'],
	list_project_memory: ['entries'],
	list_user_memory: ['entries']
};
const itemsAt = (
	output: AgentPayload,
	keys: readonly string[]
): readonly AgentPayload[] | undefined => {
	const top = agentPayloadItems(output);
	if (top) return top;
	if (!isAgentPayloadObject(output)) return undefined;
	const groups = keys
		.map((key) => agentPayloadItems(output[key]))
		.filter((group) => group !== undefined);
	return groups.length ? groups.flat() : undefined;
};
const searchEntity = (item: AgentPayload, shell?: ShellContext): EntityRef => {
	if (!isAgentPayloadObject(item)) return entityFrom(item, 'plain', shell);
	const source = item.source;
	if (isAgentPayloadObject(source)) {
		const kind = source.kind;
		if (kind === 'note' || kind === 'diagram' || kind === 'attachment' || kind === 'memory')
			return entityFrom(source, kind, shell);
	}
	return entityFrom(item, typeof item.noteId === 'string' ? 'note' : 'plain', shell);
};

export function toolCollection(
	tool: ChatToolActivity,
	kind: EntityKind,
	shell?: ShellContext
): ToolDisclosure {
	const output = toolOutput(tool);
	if (output === undefined) return { kind: 'none' };
	let entities: readonly EntityRef[];
	if (
		(tool.name === 'get_workspace_context' || tool.name === 'get_today_view') &&
		isAgentPayloadObject(output)
	) {
		const groups: readonly (readonly [string, EntityKind])[] =
			tool.name === 'get_workspace_context'
				? [
						['projects', 'project'],
						['noteTree', 'note'],
						['skills', 'skill']
					]
				: [
						['overdue', 'todo'],
						['dueToday', 'todo'],
						['waitingOn', 'todo'],
						['pinnedNotes', 'note'],
						['recentNotes', 'note']
					];
		entities = groups.flatMap(([key, groupKind]) =>
			(itemsAt(output, [key]) ?? []).map((item) => entityFrom(item, groupKind, shell))
		);
		if (typeof output.pendingSuggestionCount === 'number' && output.pendingSuggestionCount > 0)
			entities = [
				...entities,
				{
					kind: 'plain',
					title: `${output.pendingSuggestionCount} pending suggestions`,
					named: true
				}
			];
	} else {
		const items = itemsAt(output, collections[tool.name] ?? []);
		if (!items) return { kind: 'none' };
		entities = items.map((item): EntityRef => {
			if (tool.name === 'search' || tool.name === 'search_note') return searchEntity(item, shell);
			const entity = entityFrom(item, kind, shell);
			if (isAgentPayloadObject(item) && tool.name === 'list_tool_preferences')
				return {
					...entity,
					title: `${friendlyToolLabel(entity.title)} · ${item.enabled === true ? 'On' : 'Off'}`,
					destination: {
						kind: 'page',
						href: '/settings?tab=tools',
						label: 'Open tool availability'
					}
				};
			if (isAgentPayloadObject(item) && tool.name === 'list_trust_policies')
				return {
					...entity,
					title: `${friendlyToolLabel(entity.title)} · ${item.autoAcceptEnabled === true ? 'Auto-accept' : 'Review required'}`,
					destination: {
						kind: 'page',
						href: '/settings?tab=policies',
						label: 'Open trust policies'
					}
				};
			if (tool.name === 'list_api_tokens')
				return {
					...entity,
					destination: { kind: 'page', href: '/settings?tab=mcp', label: 'Open access tokens' }
				};
			return tool.name === 'search_tools'
				? { ...entity, title: friendlyToolLabel(entity.title) }
				: entity;
		});
	}
	const total =
		isAgentPayloadObject(output) && typeof output.total === 'number'
			? output.total
			: entities.length;
	return { kind: 'collection', entities, total };
}
