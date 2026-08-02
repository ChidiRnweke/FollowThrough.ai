import { describe, expect, it } from 'vitest';
import type { FunctionTool } from '@openai/agents';
import type { ControllerFactory } from '$lib/server/controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { noteEtag } from '$lib/models/notes';
import {
	noteBuilder,
	testActor,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	AgentTools,
	agentToolCoverage,
	agentToolRegistry,
	LOCKED_TOOL_NAMES,
	type AgentToolClassification,
	type ToolAccessPolicy
} from './agent-tool-factory';

const registry = (mode: 'approval_required' | 'auto_accept') =>
	new AgentTools({} as ControllerFactory, testActor(), mode, {
		provenanceId: testProvenanceId(),
		input: { prompt: 'Help' },
		model: 'openai/gpt-5.6'
	});

const approvalFor = async (
	mode: 'approval_required' | 'auto_accept',
	name: string
): Promise<boolean> => {
	const selected = registry(mode)
		.tools()
		.find((candidate) => candidate.name === name) as FunctionTool;
	return selected.needsApproval({} as never, {} as never, 'call-1');
};

const indirectToolFor = (
	mode: 'approval_required' | 'auto_accept',
	name: 'search_tools' | 'use_tool',
	options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
): FunctionTool =>
	new AgentTools(
		options.factory ?? ({} as ControllerFactory),
		testActor(),
		mode,
		{
			provenanceId: testProvenanceId(),
			input: { prompt: 'Help' },
			model: 'openai/gpt-5.6'
		},
		undefined,
		options.retriever
	)
		.agentTools()
		.find((candidate) => candidate.name === name) as FunctionTool;

describe('Agent tool coverage invariants', () => {
	it('classifies every covered controller method', () => {
		const classifications = Object.values(agentToolCoverage).flatMap((controller) =>
			Object.values(controller).map((classification) => classification.kind)
		);
		expect(
			classifications.every((kind) => ['read', 'proposal', 'mutation', 'excluded'].includes(kind))
		).toBe(true);
	});

	it('registers one stable tool for every non-excluded controller action', () => {
		const classifications = Object.values(agentToolCoverage).flatMap(
			(controller) => Object.values(controller) as AgentToolClassification[]
		);
		const coveredActions = classifications.filter(
			(classification) => classification.kind !== 'excluded'
		).length;
		// Five controller actions are deliberately exposed more than once:
		// memory.list as list_project_memory and list_user_memory, notes.save as
		// save_note and edit_note, the skill body write as save_skill and
		// edit_skill, and todos.create as create_todo (single) and create_todos
		// (batch).
		const scopedAliases = 5;
		expect(registry('approval_required').tools()).toHaveLength(coveredActions + scopedAliases);
	});

	it('exposes the user profile as a read tool', async () => {
		expect(await approvalFor('approval_required', 'list_user_memory')).toBe(false);
	});

	it('keeps only frequent grounding and memory-proposal tools directly available', () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = new AgentTools(
			{} as ControllerFactory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { prompt: 'Create a note' },
				model: 'openai/gpt-5.6'
			},
			undefined,
			retriever
		).agentTools();
		expect(selected.map((tool) => tool.name)).toEqual([
			'search',
			'list_user_memory',
			'list_project_memory',
			'get_workspace_context',
			'get_note',
			'list_todos',
			'load_skill',
			'propose_memory_change',
			'search_tools',
			'use_tool'
		]);
	});

	it('keeps action tools in the searchable long-tail catalog', () => {
		expect(
			registry('auto_accept')
				.catalog()
				.some((tool) => tool.name === 'create_note')
		).toBe(true);
	});

	it('excludes first-class tools from the searchable long-tail catalog', () => {
		const names = new Set(
			registry('auto_accept')
				.catalog()
				.map((tool) => tool.name)
		);
		expect(
			[
				'search',
				'list_user_memory',
				'list_project_memory',
				'get_workspace_context',
				'get_note',
				'list_todos',
				'load_skill',
				'propose_memory_change'
			].filter((name) => names.has(name))
		).toEqual([]);
	});

	it('returns exact long-tail schemas from tool search', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = indirectToolFor('auto_accept', 'search_tools', { retriever });
		const result = await selected.invoke({} as never, JSON.stringify({ query: 'create a note' }));
		expect(Object.keys((result as Record<string, unknown>[])[0]).sort()).toEqual([
			'classification',
			'description',
			'input_schema',
			'name'
		]);
	});

	it('advertises only noteId and markdown for save_note', () => {
		const saveNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'save_note');
		expect(Object.keys(saveNote?.parameters.shape ?? {}).sort()).toEqual(['markdown', 'noteId']);
	});

	it('keeps save_note searchable instead of registering it directly', () => {
		const available = registry('auto_accept');
		expect([
			available.agentTools().some((candidate) => candidate.name === 'save_note'),
			available.catalog().some((candidate) => candidate.name === 'save_note')
		]).toEqual([false, true]);
	});

	it('advertises only noteId and edits for edit_note', () => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		expect(Object.keys(editNote?.parameters.shape ?? {}).sort()).toEqual(['edits', 'noteId']);
	});

	it('keeps edit_note searchable instead of registering it directly', () => {
		const available = registry('auto_accept');
		expect([
			available.agentTools().some((candidate) => candidate.name === 'edit_note'),
			available.catalog().some((candidate) => candidate.name === 'edit_note')
		]).toEqual([false, true]);
	});

	it('classifies edit_note as a mutation', () => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		expect(editNote?.classification).toBe('mutation');
	});

	it('advertises only noteId and markdown for save_skill', () => {
		const saveSkill = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'save_skill');
		expect(Object.keys(saveSkill?.parameters.shape ?? {}).sort()).toEqual(['markdown', 'noteId']);
	});

	it('advertises only noteId and edits for edit_skill', () => {
		const editSkill = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_skill');
		expect(Object.keys(editSkill?.parameters.shape ?? {}).sort()).toEqual(['edits', 'noteId']);
	});

	it('keeps edit_skill and save_skill searchable instead of registering them directly', () => {
		const available = registry('auto_accept');
		expect([
			available.agentTools().some((candidate) => candidate.name === 'edit_skill'),
			available.catalog().some((candidate) => candidate.name === 'edit_skill'),
			available.agentTools().some((candidate) => candidate.name === 'save_skill'),
			available.catalog().some((candidate) => candidate.name === 'save_skill')
		]).toEqual([false, true, false, true]);
	});

	it('classifies edit_skill as a mutation', () => {
		const editSkill = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_skill');
		expect(editSkill?.classification).toBe('mutation');
	});

	it('classifies save_skill as a mutation', () => {
		const saveSkill = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'save_skill');
		expect(saveSkill?.classification).toBe('mutation');
	});

	it('advertises the read-before-edit contract in edit_note and get_note descriptions (1/3)', () => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		const _getNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'get_note');
		expect(editNote?.description).toMatch(/MUST call get_note/);
	});

	it('advertises the read-before-edit contract in edit_note and get_note descriptions (2/3)', () => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		const _getNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'get_note');
		expect(editNote?.description).toMatch(/never retry the same oldText/);
	});

	it('advertises the read-before-edit contract in edit_note and get_note descriptions (3/3)', () => {
		const _editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		const getNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'get_note');
		expect(getNote?.description).toMatch(/before your first edit_note or save_note/);
	});

	it('advertises only noteId for get_note', () => {
		const getNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'get_note');
		expect(Object.keys(getNote?.parameters.shape ?? {}).sort()).toEqual(['noteId']);
	});

	it('returns the note body as Markdown, not ProseMirror, by default', () => {
		const note = noteBuilder({
			id: crypto.randomUUID() as never,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world.' }] }]
			} as never
		});
		const factory = {
			notes: () => ({
				get: async () => ({
					note,
					etag: noteEtag(note),
					backlinks: [],
					references: [],
					diagrams: [],
					todos: [],
					pendingSuggestions: []
				})
			})
		} as unknown as ControllerFactory;
		const getNote = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		return expect(getNote?.execute({ noteId: note.id })).resolves.toMatchObject({
			noteId: note.id,
			title: note.title,
			etag: noteEtag(note),
			markdown: expect.stringContaining('Hello world.')
		});
	});

	it('keeps the related items on the default get_note read', () => {
		const note = noteBuilder({ id: crypto.randomUUID() as never });
		const factory = {
			notes: () => ({
				get: async () => ({
					note,
					etag: noteEtag(note),
					backlinks: [{ id: 'bl' }],
					references: [{ id: 'ref' }],
					diagrams: [{ id: 'dg' }],
					todos: [{ id: 'td' }],
					pendingSuggestions: [{ id: 'sg' }]
				})
			})
		} as unknown as ControllerFactory;
		const getNote = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		return expect(getNote?.execute({ noteId: note.id })).resolves.toMatchObject({
			backlinks: [{ id: 'bl' }],
			references: [{ id: 'ref' }],
			diagrams: [{ id: 'dg' }],
			todos: [{ id: 'td' }],
			pendingSuggestions: [{ id: 'sg' }]
		});
	});

	it('keeps the ProseMirror document off the get_note wire', () => {
		const note = noteBuilder({ id: crypto.randomUUID() as never });
		const factory = {
			notes: () => ({
				get: async () => ({
					note,
					etag: noteEtag(note),
					backlinks: [],
					references: [],
					diagrams: [],
					todos: [],
					pendingSuggestions: []
				})
			})
		} as unknown as ControllerFactory;
		const getNote = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		return expect(getNote?.execute({ noteId: note.id })).resolves.not.toHaveProperty('document');
	});

	it('keeps the storage Note row off the get_note wire', () => {
		const note = noteBuilder({ id: crypto.randomUUID() as never });
		const factory = {
			notes: () => ({
				get: async () => ({
					note,
					etag: noteEtag(note),
					backlinks: [],
					references: [],
					diagrams: [],
					todos: [],
					pendingSuggestions: []
				})
			})
		} as unknown as ControllerFactory;
		const getNote = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		return expect(getNote?.execute({ noteId: note.id })).resolves.not.toHaveProperty('note');
	});

	it('keeps the redundant plainText off the get_note wire', () => {
		const note = noteBuilder({ id: crypto.randomUUID() as never });
		const factory = {
			notes: () => ({
				get: async () => ({
					note,
					etag: noteEtag(note),
					backlinks: [],
					references: [],
					diagrams: [],
					todos: [],
					pendingSuggestions: []
				})
			})
		} as unknown as ControllerFactory;
		const getNote = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		return expect(getNote?.execute({ noteId: note.id })).resolves.not.toHaveProperty('plainText');
	});

	const skillFixture = (body = 'Number every finding.') => {
		const note = noteBuilder({
			id: crypto.randomUUID() as never,
			kind: 'skill',
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }]
			} as never
		});
		const view = {
			skill: {
				note,
				name: 'Compliance format',
				description: 'Formats responses for compliance review',
				triggerHints: ['compliance', 'audit']
			},
			usages: [{ usage: { id: 'usage-1' } }, { usage: { id: 'usage-2' } }]
		};
		const factory = {
			skills: () => ({
				get: async () => view,
				loadForAgent: async () => view
			})
		} as unknown as ControllerFactory;
		const definitions = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Use a skill' },
			model: 'openai/gpt-5.6'
		}).definitions();
		const skillTool = (name: string) => definitions.find((definition) => definition.name === name);
		return { noteId: note.id, skillTool };
	};

	it('returns the skill body as Markdown', async () => {
		const fixture = skillFixture();
		expect(
			await fixture.skillTool('load_skill')?.execute({ noteId: fixture.noteId })
		).toMatchObject({ instructions: expect.stringContaining('Number every finding.') });
	});

	it('keeps the skill name, description, and trigger hints on the load', async () => {
		const fixture = skillFixture();
		expect(await fixture.skillTool('get_skill')?.execute({ noteId: fixture.noteId })).toMatchObject(
			{
				name: 'Compliance format',
				description: 'Formats responses for compliance review',
				triggerHints: ['compliance', 'audit']
			}
		);
	});

	it('keeps the ProseMirror document off the skill wire', async () => {
		const fixture = skillFixture();
		expect(
			await fixture.skillTool('load_skill')?.execute({ noteId: fixture.noteId })
		).not.toHaveProperty('document');
	});

	it('keeps the note row off the skill wire', async () => {
		const fixture = skillFixture();
		expect(
			await fixture.skillTool('load_skill')?.execute({ noteId: fixture.noteId })
		).not.toHaveProperty('note');
	});

	it('keeps usage telemetry off the skill wire', async () => {
		const fixture = skillFixture();
		expect(
			await fixture.skillTool('load_skill')?.execute({ noteId: fixture.noteId })
		).not.toHaveProperty('usages');
	});

	it('requires approval for long-tail mutations in approval-required mode', async () => {
		const selected = indirectToolFor('approval_required', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'create_note', payload: { title: 'Decision log' } } as never,
				'call-1'
			)
		).toBe(true);
	});

	it('runs long-tail mutations without approval in auto-accept mode', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'create_note', payload: { title: 'Decision log' } } as never,
				'call-1'
			)
		).toBe(false);
	});

	it('runs long-tail reads without approval', async () => {
		const selected = indirectToolFor('approval_required', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'list_projects', payload: {} } as never,
				'call-1'
			)
		).toBe(false);
	});

	it('threads the run provenanceId into load_skill even when the context omits it (1/2)', async () => {
		let _receivedProvenanceId: unknown;
		const skill = {
			note: noteBuilder({ id: crypto.randomUUID() as never, kind: 'skill' }),
			name: 'Compliance format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance']
		};
		const factory = {
			toolPreferences: () => ({ list: async () => [] }),
			skills: () => ({
				loadForAgent: async (_actor: unknown, input: { provenanceId: unknown }) => {
					_receivedProvenanceId = input.provenanceId;
					return { skill, usages: [] };
				}
			})
		} as unknown as ControllerFactory;
		const run = {
			userId: testActor().userId,
			executionMode: 'auto_accept',
			model: 'openai/gpt-5.6',
			provenanceId: testProvenanceId()
		};
		const registry = await agentToolRegistry(
			() => factory,
			new InMemoryToolRetriever()
		)({
			actor: testActor(),
			request: { prompt: 'Help' } as never,
			run: run as never,
			executor: { execute: async (_input, action) => action() }
		});
		const loadSkill = registry.agentTools().find((candidate) => candidate.name === 'load_skill');
		expect(loadSkill).toBeDefined();
		await (loadSkill as FunctionTool).invoke(
			{} as never,
			JSON.stringify({ noteId: '11111111-1111-4111-8111-111111111111' })
		);
	});

	it('threads the run provenanceId into load_skill even when the context omits it (2/2)', async () => {
		let receivedProvenanceId: unknown;
		const skill = {
			note: noteBuilder({ id: crypto.randomUUID() as never, kind: 'skill' }),
			name: 'Compliance format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance']
		};
		const factory = {
			toolPreferences: () => ({ list: async () => [] }),
			skills: () => ({
				loadForAgent: async (_actor: unknown, input: { provenanceId: unknown }) => {
					receivedProvenanceId = input.provenanceId;
					return { skill, usages: [] };
				}
			})
		} as unknown as ControllerFactory;
		const run = {
			userId: testActor().userId,
			executionMode: 'auto_accept',
			model: 'openai/gpt-5.6',
			provenanceId: testProvenanceId()
		};
		const registry = await agentToolRegistry(
			() => factory,
			new InMemoryToolRetriever()
		)({
			actor: testActor(),
			request: { prompt: 'Help' } as never,
			run: run as never,
			executor: { execute: async (_input, action) => action() }
		});
		const loadSkill = registry.agentTools().find((candidate) => candidate.name === 'load_skill');
		await (loadSkill as FunctionTool).invoke(
			{} as never,
			JSON.stringify({ noteId: '11111111-1111-4111-8111-111111111111' })
		);
		expect(receivedProvenanceId).toBe(run.provenanceId);
	});

	it('dispatches an exact long-tail tool name to its controller', async () => {
		// Mirrors the real ListProjectsOutput shape. The agent-facing payload is a
		// projection of it: id and name only, without the userId and audit stamps
		// the model cannot use.
		const factory = {
			projects: () => ({
				list: async () => ({
					projects: [
						{
							id: 'project-1',
							userId: 'user-1',
							name: 'General',
							createdAt: '2026-01-01T00:00:00.000Z',
							updatedAt: '2026-01-01T00:00:00.000Z'
						}
					]
				})
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'list_projects', payload: {} })
		);
		expect(result).toEqual({
			projects: [{ id: 'project-1', name: 'General', createdAt: '2026-01-01T00:00:00.000Z' }]
		});
	});

	it('filters list results inclusively by creation time', async () => {
		const factory = {
			projects: () => ({
				list: async () => ({
					projects: [
						{ id: 'first', name: 'First', createdAt: '2026-01-01T00:00:00.000Z' },
						{ id: 'second', name: 'Second', createdAt: '2026-02-01T00:00:00.000Z' }
					]
				})
			})
		} as unknown as ControllerFactory;
		const result = await indirectToolFor('auto_accept', 'use_tool', { factory }).invoke(
			{} as never,
			JSON.stringify({
				name: 'list_projects',
				payload: {
					createdAfter: '2026-02-01T00:00:00.000Z',
					createdBefore: '2026-02-01T00:00:00.000Z'
				}
			})
		);
		expect(result).toEqual({
			projects: [{ id: 'second', name: 'Second', createdAt: '2026-02-01T00:00:00.000Z' }]
		});
	});

	it('rejects a reversed creation-time range', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'list_projects',
				payload: {
					createdAfter: '2026-02-01T00:00:00.000Z',
					createdBefore: '2026-01-01T00:00:00.000Z'
				}
			})
		);
		expect(result).toMatchObject({
			issues: [{ message: 'createdAfter must be before or equal to createdBefore' }]
		});
	});

	it('creates every todo in a single create_todos dispatch (1/3)', async () => {
		const projectId = crypto.randomUUID();
		const calls: { projectId: string; title: string }[] = [];
		const factory = {
			todos: () => ({
				create: async (_actor: unknown, input: { projectId: string; title: string }) => {
					calls.push(input);
					return { todo: { id: `todo-${calls.length}`, ...input } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const _result = await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'create_todos',
				payload: {
					projectId,
					todos: [
						{ title: 'Renew TLS certificates', responsibility: 'mine' },
						{ title: 'Book offsite flights', responsibility: 'mine' },
						{ title: 'Review incident postmortem', responsibility: 'waiting_on', waitingOn: 'Sam' }
					]
				}
			})
		);
		expect(calls).toHaveLength(3);
	});

	it('creates every todo in a single create_todos dispatch (2/3)', async () => {
		const projectId = crypto.randomUUID();
		const calls: { projectId: string; title: string }[] = [];
		const factory = {
			todos: () => ({
				create: async (_actor: unknown, input: { projectId: string; title: string }) => {
					calls.push(input);
					return { todo: { id: `todo-${calls.length}`, ...input } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const _result = await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'create_todos',
				payload: {
					projectId,
					todos: [
						{ title: 'Renew TLS certificates', responsibility: 'mine' },
						{ title: 'Book offsite flights', responsibility: 'mine' },
						{ title: 'Review incident postmortem', responsibility: 'waiting_on', waitingOn: 'Sam' }
					]
				}
			})
		);
		expect(calls.map((call) => call.projectId)).toEqual([projectId, projectId, projectId]);
	});

	it('creates every todo in a single create_todos dispatch (3/3)', async () => {
		const projectId = crypto.randomUUID();
		const calls: { projectId: string; title: string }[] = [];
		const factory = {
			todos: () => ({
				create: async (_actor: unknown, input: { projectId: string; title: string }) => {
					calls.push(input);
					return { todo: { id: `todo-${calls.length}`, ...input } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'create_todos',
				payload: {
					projectId,
					todos: [
						{ title: 'Renew TLS certificates', responsibility: 'mine' },
						{ title: 'Book offsite flights', responsibility: 'mine' },
						{ title: 'Review incident postmortem', responsibility: 'waiting_on', waitingOn: 'Sam' }
					]
				}
			})
		);
		expect(result).toEqual({
			todos: [
				{
					todo: { id: 'todo-1', projectId, title: 'Renew TLS certificates', responsibility: 'mine' }
				},
				{
					todo: { id: 'todo-2', projectId, title: 'Book offsite flights', responsibility: 'mine' }
				},
				{
					todo: {
						id: 'todo-3',
						projectId,
						title: 'Review incident postmortem',
						responsibility: 'waiting_on',
						waitingOn: 'Sam'
					}
				}
			]
		});
	});

	it('rejects invalid create_todos payloads with a model-readable error', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const projectId = crypto.randomUUID();
		for (const payload of [
			{ projectId, todos: [] },
			{ projectId, todos: [{ responsibility: 'mine' }] },
			{ projectId }
		]) {
			const result = await selected.invoke(
				{} as never,
				JSON.stringify({ name: 'create_todos', payload })
			);
			expect(result).toMatchObject({
				failure: 'Invalid payload for "create_todos".',
				input_schema: { type: 'object' }
			});
		}
	});

	it('keeps create_todos in the long-tail catalog, not the first-class tools (1/2)', () => {
		const instance = registry('auto_accept');
		expect(instance.catalog().some((tool) => tool.name === 'create_todos')).toBe(true);
	});

	it('keeps create_todos in the long-tail catalog, not the first-class tools (2/2)', () => {
		const instance = registry('auto_accept');
		expect(instance.agentTools().some((tool) => tool.name === 'create_todos')).toBe(false);
	});

	it('does not execute a guessed long-tail tool name', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'creat_note', payload: { title: 'Decision log' } })
		);
		expect(result).toMatchObject({
			failure: expect.stringContaining('Did you mean'),
			suggestions: expect.arrayContaining([{ name: 'create_note', invokeVia: 'use_tool' }])
		});
	});

	it('returns every close long-tail tool name without executing one', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'list_artifact', payload: {} })
		);
		expect(result).toMatchObject({
			suggestions: [
				{ name: 'list_artifacts', invokeVia: 'use_tool' },
				{ name: 'get_artifact', invokeVia: 'use_tool' }
			]
		});
	});

	it('returns model-readable validation errors for invalid long-tail payloads', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'create_note', payload: {} })
		);
		expect(result).toMatchObject({
			failure: 'Invalid payload for "create_note".',
			input_schema: { type: 'object' }
		});
	});

	it('guides a double-serialized arguments envelope without throwing', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({
				arguments: JSON.stringify({
					name: 'create_note',
					payload: { title: 'Decision log' }
				})
			})
		);
		expect(result).toMatchObject({
			failure: 'Invalid use_tool input.',
			recovery: expect.stringContaining('Do not nest the object under "arguments"')
		});
	});

	it('guides syntactically invalid use_tool JSON without throwing', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke({} as never, '{"name":"create_note",');
		expect(JSON.parse(result as string)).toMatchObject({
			failure: 'Invalid use_tool input.',
			recovery: expect.stringContaining('do not JSON-stringify the payload')
		});
	});

	it('saves Markdown against the authoritative note and returns a compact receipt', async () => {
		const current = noteBuilder({ id: crypto.randomUUID() as never, title: 'About me' });
		const factory = {
			notes: () => ({
				get: async () => ({ note: current }),
				save: async (_actor: unknown, input: { note: typeof current }) => ({
					note: { ...input.note, currentRevision: 2 },
					etag: 'note:unused:r2',
					repairedAnchorIds: []
				})
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'save_note',
				payload: { noteId: current.id, markdown: '# Profile\n\n- Engineer' }
			})
		);
		expect(result).toEqual({
			noteId: current.id,
			title: 'About me',
			currentRevision: 2
		});
	});

	it('preserves server-owned note fields while replacing Markdown content', async () => {
		const current = noteBuilder({
			id: crypto.randomUUID() as never,
			title: 'About me',
			position: 7,
			kind: 'skill'
		});
		let saved: typeof current | undefined;
		const factory = {
			notes: () => ({
				get: async () => ({ note: current }),
				save: async (_actor: unknown, input: { note: typeof current }) => {
					saved = input.note;
					return { note: input.note, etag: 'note:unused:r1', repairedAnchorIds: [] };
				}
			})
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		await selected.invoke(
			{} as never,
			JSON.stringify({
				name: 'save_note',
				payload: { noteId: current.id, markdown: 'New **body**' }
			})
		);
		expect({
			id: saved?.id,
			projectId: saved?.projectId,
			kind: saved?.kind,
			position: saved?.position,
			title: saved?.title,
			plainText: saved?.plainText
		}).toEqual({
			id: current.id,
			projectId: current.projectId,
			kind: 'skill',
			position: 7,
			title: 'About me',
			plainText: 'New body'
		});
	});

	/**
	 * A note holds diagrams and callouts Markdown has no native syntax for, so the
	 * behaviour worth pinning is not "the edit applied" but "nothing else moved".
	 */
	const editNoteFixture = () => {
		const current = noteBuilder({
			id: crypto.randomUUID() as never,
			title: 'Design',
			document: {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'The cache is write-through.' }] },
					{
						type: 'mermaid',
						attrs: { width: '100%' },
						content: [{ type: 'text', text: 'graph TD\nA-->B' }]
					},
					{ type: 'paragraph', content: [{ type: 'text', text: 'Revisit in Q3.' }] }
				]
			} as never
		});
		let saved: typeof current | undefined;
		const factory = {
			notes: () => ({
				get: async () => ({ note: current }),
				save: async (_actor: unknown, input: { note: typeof current }) => {
					saved = input.note;
					return {
						note: { ...input.note, currentRevision: 2 },
						etag: 'note:x:r2',
						repairedAnchorIds: []
					};
				}
			})
		} as unknown as ControllerFactory;
		const invoke = (edits: unknown) =>
			indirectToolFor('auto_accept', 'use_tool', { factory }).invoke(
				{} as never,
				JSON.stringify({ name: 'edit_note', payload: { noteId: current.id, edits } })
			);
		return { current, invoke, saved: () => saved };
	};

	it('applies a targeted edit to the anchored text', async () => {
		const fixture = editNoteFixture();
		await fixture.invoke([{ oldText: 'write-through', newText: 'write-behind' }]);
		expect(fixture.saved()?.plainText).toContain('The cache is write-behind.');
	});

	it('leaves untouched prose intact when editing a note', async () => {
		const fixture = editNoteFixture();
		await fixture.invoke([{ oldText: 'write-through', newText: 'write-behind' }]);
		expect(fixture.saved()?.plainText).toContain('Revisit in Q3.');
	});

	it('keeps a diagram the edit never mentioned', async () => {
		const fixture = editNoteFixture();
		await fixture.invoke([{ oldText: 'write-through', newText: 'write-behind' }]);
		expect(JSON.stringify(fixture.saved()?.document)).toContain('graph TD');
	});

	it('reports how many edits applied', async () => {
		const fixture = editNoteFixture();
		const result = await fixture.invoke([{ oldText: 'write-through', newText: 'write-behind' }]);
		expect(result).toMatchObject({ appliedEdits: 1 });
	});

	it('saves nothing when an anchor does not match', async () => {
		const fixture = editNoteFixture();
		await fixture.invoke([{ oldText: 'read-through', newText: 'write-behind' }]);
		expect(fixture.saved()).toBeUndefined();
	});

	it('explains a failed edit instead of throwing, so the model can correct it', async () => {
		const fixture = editNoteFixture();
		const result = await fixture.invoke([{ oldText: 'read-through', newText: 'x' }]);
		expect(result).toMatchObject({ failure: 'No edits were applied.' });
	});

	const editSkillFixture = () => {
		const current = noteBuilder({
			id: crypto.randomUUID() as never,
			kind: 'skill',
			title: 'Compliance format',
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Number every finding.' }] }]
			} as never
		});
		const skill = {
			note: current,
			name: 'Compliance format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance']
		};
		let saved: typeof current | undefined;
		const factory = {
			skills: () => ({ get: async () => ({ skill, usages: [] }) }),
			notes: () => ({
				save: async (_actor: unknown, input: { note: typeof current }) => {
					saved = input.note;
					return {
						note: { ...input.note, currentRevision: 2 },
						etag: 'note:x:r2',
						repairedAnchorIds: []
					};
				}
			})
		} as unknown as ControllerFactory;
		const invoke = (name: string, payload: unknown) =>
			indirectToolFor('auto_accept', 'use_tool', { factory }).invoke(
				{} as never,
				JSON.stringify({ name, payload })
			);
		return { current, invoke, saved: () => saved };
	};

	it('applies a targeted edit to a skill body', async () => {
		const fixture = editSkillFixture();
		await fixture.invoke('edit_skill', {
			noteId: fixture.current.id,
			edits: [{ oldText: 'Number every finding.', newText: 'Number every finding exactly once.' }]
		});
		expect(fixture.saved()?.plainText).toContain('exactly once.');
	});

	it('replaces a whole skill body with save_skill', async () => {
		const fixture = editSkillFixture();
		await fixture.invoke('save_skill', {
			noteId: fixture.current.id,
			markdown: 'New instructions.'
		});
		expect(fixture.saved()?.plainText).toBe('New instructions.');
	});

	it('reports how many skill edits applied', async () => {
		const fixture = editSkillFixture();
		const result = await fixture.invoke('edit_skill', {
			noteId: fixture.current.id,
			edits: [{ oldText: 'Number every finding.', newText: 'Number every finding exactly once.' }]
		});
		expect(result).toMatchObject({ appliedEdits: 1 });
	});

	it('saves nothing when a skill anchor does not match', async () => {
		const fixture = editSkillFixture();
		await fixture.invoke('edit_skill', {
			noteId: fixture.current.id,
			edits: [{ oldText: 'read-through', newText: 'write-behind' }]
		});
		expect(fixture.saved()).toBeUndefined();
	});

	it('refuses edit_skill on a note that is not a skill', async () => {
		const note = noteBuilder({ id: crypto.randomUUID() as never, kind: 'note' });
		const factory = {
			skills: () => ({
				get: async () => ({
					skill: { note, name: 'n', description: 'd', triggerHints: [] },
					usages: []
				})
			}),
			notes: () => ({ save: async () => ({ note: {}, etag: '', repairedAnchorIds: [] }) })
		} as unknown as ControllerFactory;
		const result = await indirectToolFor('auto_accept', 'use_tool', { factory }).invoke(
			{} as never,
			JSON.stringify({
				name: 'edit_skill',
				payload: { noteId: note.id, edits: [{ oldText: 'x', newText: 'y' }] }
			})
		);
		expect(result).toMatchObject({ failure: expect.stringContaining('not a skill') });
	});

	it('does not expose the agent controller recursively', () => {
		const names = registry('approval_required')
			.tools()
			.map((candidate) => candidate.name);
		expect(names.some((name) => name === 'run_agent')).toBe(false);
	});

	it('pauses mutation tools in approval-required mode', async () => {
		expect(await approvalFor('approval_required', 'create_note')).toBe(true);
	});

	it('executes proposal tools without approval', async () => {
		expect(await approvalFor('approval_required', 'extract_promises')).toBe(false);
	});

	it('executes mutation tools immediately in auto-accept mode', async () => {
		expect(await approvalFor('auto_accept', 'create_note')).toBe(false);
	});

	it('exposes lazy skill loading as a read tool', async () => {
		expect(await approvalFor('approval_required', 'load_skill')).toBe(false);
	});

	it('limits diagram workflows to read-only controller tools', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect(names.includes('generate_mermaid_diagram')).toBe(false);
	});

	it('allows diagram workflows to read shared project memory', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect(names.includes('list_project_memory')).toBe(true);
	});

	it('executes agent actions through the actor-scoped controller factory', async () => {
		let received: unknown;
		const factory = {
			notes: () => ({
				create: async (actor: unknown, input: unknown) => {
					received = { actor, input };
					return { note: { id: 'note-1' } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Create a note' },
			model: 'openai/gpt-5.6'
		})
			.tools()
			.find((candidate) => candidate.name === 'create_note') as FunctionTool;
		await selected.invoke({} as never, JSON.stringify({ title: 'Agent draft' }));
		expect(received).toEqual({ actor: testActor(), input: { title: 'Agent draft' } });
	});

	it('uses the effective conversation model for reference search', async () => {
		let receivedModel: string | undefined;
		const factory = {
			references: () => ({
				suggestFromSelection: async (
					_actor: unknown,
					_input: unknown,
					options?: { model?: string }
				) => {
					receivedModel = options?.model;
					return { outcome: 'nothing_relevant' };
				}
			})
		} as unknown as ControllerFactory;
		const selected = new AgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Find references' },
			model: 'anthropic/claude-sonnet-4.5'
		})
			.tools()
			.find((candidate) => candidate.name === 'find_references') as FunctionTool;
		await selected.invoke(
			{} as never,
			JSON.stringify({
				selection: {
					noteId: '00000000-0000-4000-8000-000000000001',
					revision: 1,
					from: 0,
					to: 4,
					text: 'OAuth'
				}
			})
		);
		expect(receivedModel).toBe('anthropic/claude-sonnet-4.5');
	});
});

describe('Deselected tools', () => {
	const without = (...disabled: string[]): AgentTools => {
		const policy: ToolAccessPolicy = { isEnabled: (name) => !disabled.includes(name) };
		return new AgentTools(
			{} as ControllerFactory,
			testActor(),
			'auto_accept',
			{ provenanceId: testProvenanceId(), input: { prompt: 'Help' }, model: 'openai/gpt-5.6' },
			undefined,
			undefined,
			policy
		);
	};

	it('drops the tool from the definition list', () => {
		expect(
			without('archive_project')
				.definitions()
				.some((definition) => definition.name === 'archive_project')
		).toBe(false);
	});

	it('drops the tool from the searchable long-tail catalog', () => {
		expect(
			without('archive_project')
				.catalog()
				.some((tool) => tool.name === 'archive_project')
		).toBe(false);
	});

	it('leaves the tools that were not deselected alone', () => {
		expect(
			without('archive_project')
				.definitions()
				.some((definition) => definition.name === 'create_note')
		).toBe(true);
	});

	it('drops a deselected first-class tool from the agent surface', () => {
		expect(
			without('get_note')
				.agentTools()
				.some((tool) => tool.name === 'get_note')
		).toBe(false);
	});

	it('keeps locked tools even when the policy rejects them', () => {
		const names = new Set(
			without(...LOCKED_TOOL_NAMES)
				.definitions()
				.map((definition) => definition.name)
		);
		expect(LOCKED_TOOL_NAMES.filter((name) => !names.has(name))).toEqual([]);
	});

	it('refuses a deselected tool by name through use_tool', async () => {
		const selected = without('archive_project')
			.agentTools()
			.find((candidate) => candidate.name === 'use_tool') as FunctionTool;
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'archive_project', payload: {} })
		);
		expect((result as { failure?: string }).failure).toBeDefined();
	});
});
