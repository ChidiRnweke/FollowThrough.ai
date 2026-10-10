import { createWidgetRules } from '$lib/factories/widgets/rules';
import type { AgentToolSessionInput } from '$lib/models/agent-tool-session';
import type { TextSelection } from '$lib/models/notes';
import { noteEtag } from '$lib/models/notes';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { ApiTokens } from '$lib/server/controllers/api-tokens/controller';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { Widgets, type WidgetsDependencies } from '$lib/server/controllers/widgets/controller';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { ToolAccess } from '$lib/server/services/agent/tools/preferences';
import { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';
import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { TodoBatchReceipts } from '$lib/server/services/todos/batch-receipts';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryToolPreferenceRepository } from '$lib/testing/agent/fakes/in-memory-tool-preferences';
import { agentProjectsFixture } from '$lib/testing/agent/fixtures/projects';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { resultItem } from '$lib/testing/agent/session-items';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	InMemoryDiagrams,
	drawioBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import {
	InMemoryApiTokenRepository,
	testTokenUser
} from '$lib/testing/identity/fakes/in-memory-api-tokens';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { noteViewFixture } from '$lib/testing/notes/fixtures/view';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	referenceSearchFixture,
	referenceSelection
} from '$lib/testing/references/fixtures/search';
import { loadedSkillFixture } from '$lib/testing/skills/fixtures/loaded-skill';
import { diagramSuggestionFixture } from '$lib/testing/suggestions/fixtures/diagram-application';
import { InMemoryTodoBatchReceipts } from '$lib/testing/todos/fakes/in-memory-todo-batch-receipts';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { projectBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { FunctionTool, Tool } from '@openai/agents';
import { RunContext } from '@openai/agents';
import { describe, expect, it } from 'vitest';
import type { AgentToolSurface } from './agent-tool-factory';
const noteMarkdown = new NodeNoteMarkdown();

import type { AgentToolContractBinding } from '$lib/models/agent';
import { LOCKED_TOOL_NAMES, TOOL_DESCRIPTIONS } from '$lib/models/agent/tool-catalog';
import { toolFailureSchema } from '$lib/models/agent/tool-failure';
import type { AgentToolCompletionObserver } from '$lib/server/services/agent/runs/contracts';
import {
	appContextBuilder,
	noteBuilder,
	testActor,
	testConversationId,
	testDiagramId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	agentToolCoverage,
	agentToolRegistry,
	createAgentToolSurface,
	createMcpToolDefinitions,
	type ToolAccessPolicy
} from './agent-tool-factory';

const executeDirectly: AgentToolCompletionObserver = {
	completed: async () => {}
};
const allTools: ToolAccessPolicy = { isEnabled: () => true };

const createAgentTools = (
	controllers: Parameters<typeof createAgentToolSurface>[1],
	actor: Parameters<typeof createAgentToolSurface>[2],
	mode: Parameters<typeof createAgentToolSurface>[3],
	context: Parameters<typeof createAgentToolSurface>[4],
	executor: AgentToolCompletionObserver = executeDirectly,
	retriever: InMemoryToolRetriever = new InMemoryToolRetriever(),
	access: ToolAccessPolicy = allTools
): AgentToolSurface =>
	createAgentToolSurface(
		testTokenizer,
		controllers,
		actor,
		mode,
		context,
		executor,
		retriever,
		access
	);

let freshKeyCounter = 0;
const freshKey = (): string => `fresh:${freshKeyCounter++}`;

const memoizeAgentTools = <Args extends unknown[], Result>(
	keyOf: (...args: Args) => string,
	build: (...args: Args) => Result
): ((...args: Args) => Result) => {
	const cache = new Map<string, Result>();
	return (...args: Args) => {
		const key = keyOf(...args);
		const hit = cache.get(key);
		if (hit !== undefined) return hit;
		const value = build(...args);
		cache.set(key, value);
		return value;
	};
};

const authoritativeSelection: TextSelection = {
	noteId: '00000000-0000-4000-8000-000000000001' as never,
	revision: 3,
	from: 7,
	to: 12,
	text: 'OAuth'
};

const registry = memoizeAgentTools(
	(mode: 'approval_required' | 'auto_accept', options: { factory?: ControllerFactory } = {}) =>
		options.factory ? freshKey() : `registry:${mode}`,
	(mode: 'approval_required' | 'auto_accept', options: { factory?: ControllerFactory } = {}) =>
		createAgentToolSurface(
			testTokenizer,
			options.factory ?? ({} as ControllerFactory),
			testActor(),
			mode,
			{
				provenanceId: testProvenanceId(),
				// A selection is supplied so the exhaustiveness check below sees the
				// selection-bound tools, which are the only context-gated ones left.
				input: {
					conversationId: testConversationId(),
					prompt: 'Help',
					selection: authoritativeSelection
				},
				model: 'openai/gpt-5.6'
			},
			executeDirectly,
			new InMemoryToolRetriever(),
			allTools
		)
);

const approvalFor = async (
	mode: 'approval_required' | 'auto_accept',
	name: string
): Promise<boolean> => {
	const selected = registry(mode)
		.tools()
		.find((candidate) => candidate.name === name) as FunctionTool;
	return selected.needsApproval({} as never, {} as never, 'call-1');
};

/**
 * What the model is actually offered. Long-tail tools are registered up front but
 * gated behind `isEnabled`, which the SDK re-evaluates every turn, so the raw
 * `agentTools()` list is not the surface — this is.
 */
const enabledToolNames = async (tools: readonly { name: string }[]): Promise<string[]> => {
	const names: string[] = [];
	for (const candidate of tools) {
		const enabled = (candidate as FunctionTool).isEnabled;
		const active =
			typeof enabled === 'function' ? await enabled({} as never, {} as never) : enabled !== false;
		if (active) names.push(candidate.name);
	}
	return names;
};

const agentToolsRegistry = memoizeAgentTools(
	(
		mode: 'approval_required' | 'auto_accept',
		options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
	) =>
		`agentTools:${mode}:${options.factory ? freshKey() : 'default'}:${
			options.retriever ? freshKey() : 'default'
		}`,
	(
		mode: 'approval_required' | 'auto_accept',
		options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
	) =>
		createAgentToolSurface(
			testTokenizer,
			options.factory ?? ({} as ControllerFactory),
			testActor(),
			mode,
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Help' },
				model: 'openai/gpt-5.6'
			},
			executeDirectly,
			options.retriever ?? new InMemoryToolRetriever(),
			allTools
		)
);

const agentToolsFor = (
	mode: 'approval_required' | 'auto_accept',
	options: {
		factory?: ControllerFactory;
		retriever?: InMemoryToolRetriever;
		promoted?: readonly string[];
	} = {}
): Tool<unknown>[] => agentToolsRegistry(mode, options).agentTools(options.promoted ?? []);

const indirectToolFor = (
	mode: 'approval_required' | 'auto_accept',
	name: 'search_tools',
	options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
): FunctionTool =>
	agentToolsFor(mode, options).find((candidate) => candidate.name === name) as FunctionTool;

/**
 * A long-tail tool as the model sees it once `search_tools` has surfaced it: a
 * direct tool taking its own flat arguments. First-class tools resolve the same
 * way without needing the promotion, which is the point — there is one call
 * shape, not two.
 */
const directToolFor = (
	mode: 'approval_required' | 'auto_accept',
	name: string,
	options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
): FunctionTool =>
	agentToolsFor(mode, { ...options, promoted: [name] }).find(
		(candidate) => candidate.name === name
	) as FunctionTool;

describe('Accepting a suggestion on the user\u2019s behalf', () => {
	it('goes through the reviewed acceptance that guards draw.io', async () => {
		const { controller, diagrams, suggestions, input } = diagramSuggestionFixture();
		const factory = capabilityDependencies<ControllerFactory>({ suggestions: () => controller });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'accept_suggestion');
		const outcome = await tool!
			.prepare({ suggestionId: input.suggestionId })
			.execute()
			.then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
		expect({
			outcome,
			diagrams: diagrams.diagrams,
			status: suggestions.suggestions[0].status
		}).toEqual({
			outcome: 'A draw.io diagram must be accepted through its review.',
			diagrams: [],
			status: 'proposed'
		});
	});
});

/**
 * Three runtime specs were deleted here, each replaced by a compiler check.
 *
 * `_CoverageCoversCatalog` / `_CoverageNamesNothingElse` beside
 * `agentToolCoverage` hold registry and catalog equal, which retired the
 * catalog-name equality spec; `AgentToolContractBinding` is a closed union, which
 * retired the classification-kind spec; and `_BuildersCoverCatalog` /
 * `_BuildersNameNothingElse` beside `BuiltToolName` hold the *constructed* set
 * equal to the catalog, which retired the one that compared them at runtime.
 *
 * What is left is what no type can see. A union collapses a name bound twice.
 * And membership is not availability: the compiler knows every tool exists to be
 * built, but which ones a given turn or surface actually offers is decided at
 * run time, and a gate that withheld the wrong tool would type-check perfectly.
 */
const boundToolNames = (): string[] =>
	Object.values(agentToolCoverage)
		.flatMap((controller) => Object.values(controller) as AgentToolContractBinding[])
		.flatMap((binding) => (binding.kind === 'excluded' ? [] : binding.tools));

describe('Agent tool coverage invariants', () => {
	it('binds each catalog tool to exactly one controller method', () => {
		const bound = boundToolNames();
		expect(bound.toSorted()).toEqual([...new Set(bound)].toSorted());
	});

	/**
	 * These four are the only selection-gated definitions, and they are gated
	 * because each one acts *on* the selection: without one there is nothing for
	 * them to read. A construction bug that dropped an unrelated tool when no
	 * selection was present would look identical to the gate doing its job.
	 */
	const SELECTION_BOUND = [
		'create_skill_from_selection',
		'extract_promises',
		'find_references',
		'relate_selection'
	];

	it('withholds exactly the selection-bound tools when a turn has no selection', () => {
		const withoutSelection = createAgentTools(
			{} as ControllerFactory,
			testActor(),
			'approval_required',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Help' },
				model: 'openai/gpt-5.6'
			}
		);
		expect(
			withoutSelection
				.tools()
				.map((tool) => tool.name)
				.toSorted()
		).toEqual(
			boundToolNames()
				.filter((name) => !SELECTION_BOUND.includes(name))
				.toSorted()
		);
	});

	/**
	 * The MCP surface composes a different pair of definition sets, and nothing
	 * compared its constructed list to anything at all. It is the same contracts
	 * minus the app-surface tools, which are excluded because their whole effect
	 * lands in a window an external host cannot see.
	 */
	it('builds every contract on the MCP surface except the app-surface tools', () => {
		const mcp = createMcpToolDefinitions(
			testTokenizer,
			{} as ControllerFactory,
			testActor(),
			{ provenanceId: testProvenanceId() },
			allTools,
			new InMemoryToolRetriever()
		);
		const appSurface: readonly string[] = TOOL_DESCRIPTIONS.filter(
			(entry) => 'surface' in entry
		).map((entry) => entry.name);
		expect(
			mcp
				.definitions()
				.map((definition) => definition.name)
				.toSorted()
		).toEqual(
			boundToolNames()
				.filter((name) => !SELECTION_BOUND.includes(name) && !appSurface.includes(name))
				.toSorted()
		);
	});

	// Tool recovery reads this list to tell the model whether a name it got wrong
	// can be called right now or needs a `search_tools` round-trip first. The
	// answer used to be derived from the built SDK values by testing whether
	// `isEnabled` was a function — but `tool()` assigns every tool one, so the
	// test was always false and the list held only the promoted tools. Every
	// first-class tool was reported as needing discovery, including the note
	// writes the prompt tells the model to call directly.
	it('offers the same tools the SDK gate would allow', async () => {
		const tools = registry('auto_accept');
		const gated = await enabledToolNames(tools.agentTools());
		// `search_tools` is built rather than defined, so it has no catalog name.
		// Compared as sets: recovery reads these into one, and only membership
		// decides whether a name is offered.
		expect(tools.offeredToolNames().toSorted()).toEqual(
			gated.filter((name) => name !== 'search_tools').toSorted()
		);
	});

	it('offers a promoted long-tail tool alongside the first-class set', () => {
		expect(registry('auto_accept').offeredToolNames(['archive_project'])).toContain(
			'archive_project'
		);
	});

	it('does not offer a long-tail tool no turn has promoted', () => {
		expect(registry('auto_accept').offeredToolNames()).not.toContain('archive_project');
	});

	// The studio is a chat with a canvas beside it, not a place. Gating this on a
	// surface hid it from the very screen the studio runs on, and a capability the
	// model cannot reach is one nobody discovers.
	it('offers create_diagram in an ordinary chat', () => {
		const chat = createAgentTools({} as ControllerFactory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: {
				conversationId: testConversationId(),
				prompt: 'Help',
				appContext: appContextBuilder({ surface: { kind: 'chat', presentation: 'full_page' } })
			},
			model: 'openai/gpt-5.6'
		});
		expect(chat.tools().map((tool) => tool.name)).toContain('create_diagram');
	});

	it('exposes the user profile as a read tool', async () => {
		expect(await approvalFor('approval_required', 'list_user_memory')).toBe(false);
	});

	it('keeps only frequent grounding and memory-proposal tools directly available', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = createAgentTools(
			{} as ControllerFactory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Create a note' },
				model: 'openai/gpt-5.6'
			},
			undefined,
			retriever
		).agentTools();
		expect(await enabledToolNames(selected)).toEqual([
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
			'create_diagram',
			'edit_diagram',
			'search_tools'
		]);
	});

	it('keeps action tools in the searchable long-tail catalog', () => {
		const names = new Set(
			registry('auto_accept')
				.catalog()
				.map((tool) => tool.name)
		);
		expect({
			includesLongTail: names.has('create_note'),
			firstClassInLongTail: [
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
				'save_note'
			].filter((name) => names.has(name))
		}).toEqual({ includesLongTail: true, firstClassInLongTail: [] });
	});

	it('search_note scopes retrieval to the given note', async () => {
		const { controller, repository } = searchControllerFixture();
		const selected = searchDocumentBuilder({ noteId: testNoteId() });
		repository.documents = [selected, searchDocumentBuilder({ noteId: testNoteId(2) })].map(
			(document) => ({ userId: testActor().userId, document })
		);
		const factory = capabilityDependencies<ControllerFactory>({ retrieval: () => controller });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'search_note');
		expect(
			await tool?.prepare({ noteId: testNoteId(), query: 'messaging' }).execute()
		).toMatchObject([{ noteId: testNoteId() }]);
	});

	it('read_canvas_diagram uses the resolved run conversation', async () => {
		const conversationId = testConversationId(7);
		const sessions = new InMemoryAgentSessionRepository();
		const diagrams = new InMemoryDiagrams();
		const diagram = drawioBuilder({ id: testDiagramId(), title: 'Current' });
		diagrams.diagrams = [diagram];
		await sessions.append(testActor(), conversationId, [
			resultItem('create_diagram', 'call-1', JSON.stringify({ diagramId: diagram.id }))
		]);
		const controller = new DiagramStudio(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<DiagramStudioDependencies>({
				...agentToolResultsFixture(),
				canvasSource: new PresentedCanvasSource(sessions),
				diagramFinder: diagrams
			})
		);
		const factory = capabilityDependencies<ControllerFactory>({ diagramStudio: () => controller });
		const tool = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId, prompt: 'Read the canvas' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((tool) => tool.name === 'read_canvas_diagram');
		expect(await tool?.prepare({}).execute()).toEqual({
			kind: 'present',
			diagramId: diagram.id,
			source: diagram.source,
			title: 'Current'
		});
	});

	it('returns exact long-tail schemas from tool search', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = indirectToolFor('auto_accept', 'search_tools', { retriever });
		const result = await selected.invoke({} as never, JSON.stringify({ query: 'create a note' }));
		expect(result).toMatchObject([
			{
				name: 'create_note',
				classification: 'mutation',
				callable_directly: true,
				input_schema: {
					type: 'object',
					required: ['title'],
					properties: {
						title: { type: 'string' },
						projectId: { type: 'string' },
						parentId: { type: 'string' }
					}
				}
			}
		]);
	});

	it('promotes a searched tool onto the enabled surface', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const available = createAgentTools(
			{} as ControllerFactory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Create a note' },
				model: 'openai/gpt-5.6'
			},
			undefined,
			retriever
		);
		const tools = available.agentTools();
		const search = tools.find((candidate) => candidate.name === 'search_tools') as FunctionTool;
		await search.invoke({} as never, JSON.stringify({ query: 'create a note' }));
		expect(await enabledToolNames(tools)).toContain('create_note');
	});

	it('offers save_note directly instead of hiding it behind discovery', async () => {
		const available = registry('auto_accept');
		expect([
			(await enabledToolNames(available.agentTools())).includes('save_note'),
			available.catalog().some((candidate) => candidate.name === 'save_note')
		]).toEqual([true, false]);
	});

	it('offers edit_note directly instead of hiding it behind discovery', async () => {
		const available = registry('auto_accept');
		expect([
			(await enabledToolNames(available.agentTools())).includes('edit_note'),
			available.catalog().some((candidate) => candidate.name === 'edit_note')
		]).toEqual([true, false]);
	});

	it('keeps edit_skill and save_skill searchable instead of offering them before discovery', async () => {
		const available = registry('auto_accept');
		const enabled = await enabledToolNames(available.agentTools());
		expect([
			enabled.includes('edit_skill'),
			available.catalog().some((candidate) => candidate.name === 'edit_skill'),
			enabled.includes('save_skill'),
			available.catalog().some((candidate) => candidate.name === 'save_skill')
		]).toEqual([false, true, false, true]);
	});

	it.each(['edit_note', 'edit_skill'])('accepts more than five replacements for %s', (name) => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === name);
		const input = {
			noteId: crypto.randomUUID(),
			edits: Array.from({ length: 6 }, (_, index) => ({
				oldText: `old ${index}`,
				newText: `new ${index}`
			}))
		};
		expect(editNote?.parameters.safeParse(input).success).toBe(true);
	});

	it('advertises atomic batches for extensive note edits', () => {
		const editNote = registry('auto_accept')
			.definitions()
			.find((definition) => definition.name === 'edit_note');
		expect(editNote?.description).toContain('one atomic call');
	});

	it('returns note content and related context without leaking storage fields', async () => {
		const note = noteBuilder({ ...noteMarkdown.read('Hello world.') });
		const { controller } = noteViewFixture(note);
		const factory = capabilityDependencies<ControllerFactory>({ notes: () => controller });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'get_note');
		expect(await tool?.prepare({ noteId: note.id }).execute()).toEqual({
			noteId: note.id,
			title: note.title,
			etag: noteEtag(note.id, note.currentRevision),
			backlinks: [],
			references: [],
			diagrams: [],
			todos: [],
			pendingSuggestions: [],
			body: {
				kind: 'file',
				file: {
					kind: 'file',
					id: expect.any(String),
					checksumSha256: 'aa3ec16e6acc809d8b2818662276256abfd2f1b441cb51574933f3d4bd115d11',
					path: `/projects/${note.projectId}/notes/${note.id}.md`,
					mediaType: 'text/markdown',
					byteSize: expect.any(Number),
					lineCount: expect.any(Number),
					tokenCount: expect.any(Number)
				}
			}
		});
	});

	const skillFixture = (body = 'Number every finding.') => {
		const { note, controller } = loadedSkillFixture(body);
		const factory = capabilityDependencies<ControllerFactory>({ skills: () => controller });
		const definitions = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Use a skill' },
			model: 'openai/gpt-5.6'
		}).definitions();
		const skillTool = (name: string) => definitions.find((definition) => definition.name === name);
		return { noteId: note.id, skillTool };
	};

	it('returns the skill instructions and metadata without storage-only fields', async () => {
		const fixture = skillFixture();
		const loaded = await fixture
			.skillTool('load_skill')
			?.prepare({ noteId: fixture.noteId })
			.execute();
		expect(loaded).toMatchObject({
			instructions: expect.stringContaining('Number every finding.'),
			name: 'Compliance format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance', 'audit']
		});
		expect(loaded).not.toHaveProperty('document');
		expect(loaded).not.toHaveProperty('note');
		expect(loaded).not.toHaveProperty('usages');
	});

	it('requires approval for long-tail mutations in approval-required mode', async () => {
		const selected = directToolFor('approval_required', 'create_note');
		expect(
			await selected.needsApproval({} as never, { title: 'Decision log' } as never, 'call-1')
		).toBe(true);
	});

	it('runs long-tail mutations without approval in auto-accept mode', async () => {
		const selected = directToolFor('auto_accept', 'create_note');
		expect(
			await selected.needsApproval({} as never, { title: 'Decision log' } as never, 'call-1')
		).toBe(false);
	});

	it('runs long-tail reads without approval', async () => {
		const selected = directToolFor('approval_required', 'list_projects');
		expect(await selected.needsApproval({} as never, {} as never, 'call-1')).toBe(false);
	});

	it('threads the run provenanceId into load_skill even when the context omits it', async () => {
		const { note, controller, skills } = loadedSkillFixture();
		const factory = capabilityDependencies<ControllerFactory>({ skills: () => controller });
		const run: AgentToolSessionInput['run'] = {
			executionMode: 'auto_accept',
			model: 'openai/gpt-5.6',
			provenanceId: testProvenanceId(),
			pendingDecisions: []
		};
		const registry = await agentToolRegistry(
			() => factory,
			new InMemoryToolRetriever(),
			testTokenizer,
			new ToolAccess(new InMemoryToolPreferenceRepository())
		)({
			actor: testActor(),
			request: { prompt: 'Help', conversationId: testConversationId() },
			run,
			executor: { completed: async () => {} },
			signal: new AbortController().signal
		});
		const loadSkill = registry.agentTools().find((candidate) => candidate.name === 'load_skill');
		if (!loadSkill || loadSkill.type !== 'function')
			throw new Error('Expected load_skill function tool');
		await loadSkill.invoke(new RunContext(), JSON.stringify({ noteId: note.id }));
		expect(skills.usages.map((usage) => usage.provenanceId)).toEqual([run.provenanceId]);
	});

	it('dispatches an exact long-tail tool name to its controller', async () => {
		const project = projectBuilder({ name: 'General' });
		const { factory } = agentProjectsFixture([project]);
		const selected = directToolFor('auto_accept', 'list_projects', { factory });
		expect(await selected.invoke({} as never, '{}')).toEqual({
			projects: [{ id: project.id, name: 'General', createdAt: project.createdAt }]
		});
	});

	it('filters list results inclusively by creation time', async () => {
		const first = projectBuilder({
			id: testProjectId(1),
			name: 'First',
			createdAt: '2026-01-01T00:00:00.000Z' as never
		});
		const second = projectBuilder({
			id: testProjectId(2),
			name: 'Second',
			createdAt: '2026-02-01T00:00:00.000Z' as never
		});
		const { factory } = agentProjectsFixture([first, second]);
		const result = await directToolFor('auto_accept', 'list_projects', { factory }).invoke(
			{} as never,
			JSON.stringify({ createdAfter: second.createdAt, createdBefore: second.createdAt })
		);
		expect(result).toEqual({
			projects: [{ id: second.id, name: second.name, createdAt: second.createdAt }]
		});
	});

	it('rejects a reversed creation-time range', async () => {
		const selected = directToolFor('auto_accept', 'list_projects');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({
				createdAfter: '2026-02-01T00:00:00.000Z',
				createdBefore: '2026-01-01T00:00:00.000Z'
			})
		);
		// The direct path validates against the tool's own schema in the SDK, so the
		// refusal reaches the model as a `failure` carrying the zod issues.
		expect(JSON.stringify(result)).toContain(
			'createdAfter must be before or equal to createdBefore'
		);
	});

	it('treats blank optional search scope fields as omitted', async () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((tool) => tool.name === 'search');
		expect(
			definition?.prepare({
				query: 'deployment procedures',
				projectId: '',
				createdAfter: '',
				createdBefore: ''
			}).arguments
		).toEqual({ query: 'deployment procedures' });
	});

	it('treats blank optional todo filters as omitted', async () => {
		const projectId = testProjectId();
		const noteId = testNoteId();
		const definition = registry('auto_accept')
			.definitions()
			.find((tool) => tool.name === 'list_todos');
		expect(
			definition?.prepare({
				projectId,
				noteId,
				status: '',
				responsibility: '',
				dueBefore: '',
				createdAfter: '',
				createdBefore: ''
			}).arguments
		).toEqual({ projectId, noteId });
	});

	it('shares the saved task batch across agent and MCP retries', async () => {
		const todos = new InMemoryTodos();
		const receipts = new InMemoryTodoBatchReceipts();
		const controller = new Todos(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<TodosDependencies>({
				...agentToolResultsFixture(),
				boardExport: new TodoBoardExportService(),
				todoPresentation: new TodoPresentationService(),
				todoEditingRules: new TodoEditingRulesService(),
				todoCreationRules: new TodoEditingRulesService(),
				todoCreator: todos,
				todoBatchReceipts: new TodoBatchReceipts(receipts),
				transactionRunner: new InMemoryTransactionRunner([todos, receipts])
			})
		);
		const factory = capabilityDependencies<ControllerFactory>({ todos: () => controller });
		const selected = directToolFor('auto_accept', 'create_todos', { factory });
		const payload = {
			requestId: crypto.randomUUID(),
			projectId: testProjectId(),
			todos: [
				{ title: 'Renew TLS certificates', responsibility: 'mine' },
				{ title: 'Book flights', responsibility: 'mine' }
			]
		};
		const input = JSON.stringify(payload);
		const first = await selected.invoke({} as never, input);
		const retry = await selected.invoke({} as never, input);
		const mcp = createMcpToolDefinitions(
			testTokenizer,
			factory,
			testActor(),
			{ provenanceId: testProvenanceId() },
			allTools,
			new InMemoryToolRetriever()
		)
			.definitions()
			.find((definition) => definition.name === 'create_todos');
		if (!mcp) throw new Error('Missing task batch tool');
		const externalRetry = await mcp.prepare(payload).execute();
		expect({ first, retry, externalRetry, titles: todos.todos.map((todo) => todo.title) }).toEqual({
			first: {
				todos: todos.todos.map((todo) => ({
					todoId: todo.id,
					title: todo.title,
					status: todo.status
				}))
			},
			retry: first,
			externalRetry: first,
			titles: ['Renew TLS certificates', 'Book flights']
		});
	});

	it('rejects invalid create_todos payloads with a model-readable error', async () => {
		const selected = directToolFor('auto_accept', 'create_todos');
		const projectId = crypto.randomUUID();
		const requestId = crypto.randomUUID();
		const cases = [
			{ payload: { requestId, projectId, todos: [] }, field: 'todos' },
			{ payload: { requestId, projectId, todos: [{ responsibility: 'mine' }] }, field: 'title' },
			{ payload: { requestId, projectId }, field: 'todos' },
			{
				payload: { projectId, todos: [{ title: 'Valid task', responsibility: 'mine' }] },
				field: 'requestId'
			}
		];
		const failures = [];
		for (const { payload, field } of cases) {
			const result = await selected.invoke({} as never, JSON.stringify(payload));
			const failure = toolFailureSchema.parse(result);
			failures.push({
				code: failure.code,
				messageNamesField: failure.message.includes(field),
				recovery: failure.recovery
			});
		}
		expect(failures).toEqual(
			cases.map(() => ({
				code: 'VALIDATION',
				messageNamesField: true,
				recovery: 'Read the failure, correct the arguments it names, and call the tool again.'
			}))
		);
	});

	it('keeps create_todos on the long-tail catalog instead of the first-class surface', async () => {
		const instance = registry('auto_accept');
		expect({
			catalogued: instance.catalog().some((tool) => tool.name === 'create_todos'),
			firstClass: (await enabledToolNames(instance.agentTools())).includes('create_todos')
		}).toEqual({ catalogued: true, firstClass: false });
	});

	it('returns model-readable validation errors for invalid long-tail payloads', async () => {
		const selected = directToolFor('auto_accept', 'create_note');
		const result = await selected.invoke({} as never, JSON.stringify({}));
		const failure = toolFailureSchema.parse(result);
		expect({
			kind: failure.kind,
			code: failure.code,
			messageNamesTitle: failure.message.includes('title'),
			recovery: failure.recovery
		}).toEqual({
			kind: 'failure',
			code: 'VALIDATION',
			messageNamesTitle: true,
			recovery: 'Read the failure, correct the arguments it names, and call the tool again.'
		});
	});

	it('keeps a searched tool callable in a later turn of the same conversation', async () => {
		// The promotion set is rebuilt per user message. Seeding it from the
		// conversation's earlier tool calls is what stops turn 2 from failing a call
		// that turn 1 made successfully.
		const laterTurn = agentToolsFor('auto_accept', { promoted: ['create_note'] });
		expect(await enabledToolNames(laterTurn)).toContain('create_note');
	});

	// Schema validation is owned by the application boundary before approval.
	it('still parks an approval on a mutation whose payload is complete', async () => {
		const current = noteBuilder();
		const selected = directToolFor('approval_required', 'save_note', {
			factory: reviewedNoteFixture(current).factory
		});
		expect(
			await selected.needsApproval(
				{} as never,
				{ noteId: current.id, markdown: '# Notes' } as never,
				'call-1'
			)
		).toBe(true);
	});

	// The SDK JSON.parses a call's raw arguments before our handler runs, so a
	// model that answers an argument-free tool with "" — there is nothing to fill
	// in — used to die on InvalidToolInputError without the tool ever running. One
	// production trace spun through thirteen such calls and hit the token ceiling.

	it('treats a blank call to an argument-free tool as an empty object', async () => {
		const controller = new Widgets(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<WidgetsDependencies>({
				...agentToolResultsFixture(),
				...createWidgetRules()
			})
		);
		const factory = capabilityDependencies<ControllerFactory>({ widgets: () => controller });
		expect(
			await directToolFor('auto_accept', 'read_widget_catalog', { factory }).invoke({} as never, '')
		).toMatchObject({ catalogVersion: 3, reference: expect.stringContaining('Text') });
	});
	it('still rejects malformed non-empty arguments', async () => {
		const failure = await directToolFor('auto_accept', 'read_widget_catalog').invoke(
			{} as never,
			'{"noteId":'
		);
		expect(typeof failure === 'string' ? JSON.parse(failure) : failure).toMatchObject({
			kind: 'failure',
			code: 'VALIDATION'
		});
	});

	it('saves Markdown with a compact receipt and preserves server-owned note fields', async () => {
		const current = noteBuilder({
			id: crypto.randomUUID() as never,
			title: 'About me',
			position: 7,
			kind: 'skill'
		});
		const { factory, content } = reviewedNoteFixture(current);
		const selected = directToolFor('auto_accept', 'save_note', { factory });
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ noteId: current.id, markdown: '# Profile\n\n- Engineer' }),
			{
				toolCall: {
					type: 'function_call',
					callId: 'save-profile',
					name: 'save_note',
					arguments: '{}'
				}
			}
		);
		expect({
			receipt: result,
			id: content.notes[0].id,
			projectId: content.notes[0].projectId,
			kind: content.notes[0].kind,
			position: content.notes[0].position,
			title: content.notes[0].title,
			plainText: content.notes[0].plainText
		}).toEqual({
			receipt: { noteId: current.id, title: 'About me', currentRevision: 2 },
			id: current.id,
			projectId: current.projectId,
			kind: 'skill',
			position: 7,
			title: 'About me',
			plainText: 'Profile\n\nEngineer'
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
		const { factory, content } = reviewedNoteFixture(current);
		const invoke = (edits: unknown) =>
			directToolFor('auto_accept', 'edit_note', { factory }).invoke(
				{} as never,
				JSON.stringify({ noteId: current.id, edits }),
				{
					toolCall: {
						type: 'function_call',
						callId: 'edit-content',
						name: 'edit_note',
						arguments: '{}'
					}
				}
			);
		return {
			current,
			invoke,
			saved: () =>
				content.notes[0].currentRevision > current.currentRevision ? content.notes[0] : undefined
		};
	};

	it('applies a targeted edit and preserves the rest of the note', async () => {
		const fixture = editNoteFixture();
		const result = await fixture.invoke([{ oldText: 'write-through', newText: 'write-behind' }]);
		const saved = fixture.saved();
		const appliedEdits =
			typeof result === 'object' && result !== null && 'appliedEdits' in result
				? result.appliedEdits
				: undefined;
		expect({
			appliedEdits,
			plainText: saved?.plainText,
			document: JSON.stringify(saved?.document)
		}).toEqual({
			appliedEdits: 1,
			plainText: expect.stringContaining('Revisit in Q3.'),
			document: expect.stringContaining('graph TD')
		});
	});

	it('explains a failed edit instead of throwing, so the model can correct it', async () => {
		const fixture = editNoteFixture();
		const result = await fixture.invoke([{ oldText: 'read-through', newText: 'x' }]);
		expect({ result, saved: fixture.saved() }).toMatchObject({
			result: expect.objectContaining({ kind: 'failure', message: 'No changes were applied.' }),
			saved: undefined
		});
	});

	it('does not expose the agent controller recursively', () => {
		const names = registry('approval_required')
			.tools()
			.map((candidate) => candidate.name);
		expect(names.some((name) => name === 'run_agent')).toBe(false);
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

	it('retains diagram reads and excludes mutations from the read-only tool set', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect({
			includesDiagramReads: ['read_canvas_diagram', 'read_project_diagram'].every((name) =>
				names.includes(name)
			),
			excludesDiagramMutations: ['create_diagram', 'edit_diagram'].every(
				(name) => !names.includes(name)
			)
		}).toEqual({ includesDiagramReads: true, excludesDiagramMutations: true });
	});

	it('allows diagram workflows to read shared project memory', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect(names.includes('list_project_memory')).toBe(true);
	});

	it('executes agent actions through the actor-scoped controller factory', async () => {
		const records = new InMemoryNoteRepository();
		const projects = new InMemoryProjectRepository(records);
		projects.projects = [projectBuilder()];
		const { notes } = noteCreationControllers(
			createNoteServices(records, new InMemoryAnchorRepository(), projects).creator,
			new InMemoryTransactionRunner([records, projects])
		);
		const factory = capabilityDependencies<ControllerFactory>({ notes: () => notes });
		const result = await directToolFor('auto_accept', 'create_note', { factory }).invoke(
			{} as never,
			JSON.stringify({ title: 'Agent draft', projectId: testProjectId() })
		);
		expect({
			result,
			saved: records.notes.map((note) => ({
				id: note.id,
				userId: note.userId,
				projectId: note.projectId,
				title: note.title
			}))
		}).toEqual({
			result: { noteId: records.notes[0].id, title: 'Agent draft', currentRevision: 1 },
			saved: [
				{
					id: records.notes[0].id,
					userId: testActor().userId,
					projectId: testProjectId(),
					title: 'Agent draft'
				}
			]
		});
	});

	it('uses the effective conversation model for reference search', async () => {
		const { reference, references } = referenceSearchFixture();
		const factory = capabilityDependencies<ControllerFactory>({ references: () => reference });
		const selected = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: {
				conversationId: testConversationId(),
				prompt: 'Find references',
				selection: referenceSelection
			},
			model: 'anthropic/claude-sonnet-4.5'
		})
			.tools()
			.find((tool) => tool.name === 'find_references') as FunctionTool;
		await selected.invoke({} as never, '{}');
		expect(references.model).toBe('anthropic/claude-sonnet-4.5');
	});

	it('offers actor scoping for extracted commitments', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'extract_promises');
		expect(definition?.parameters.shape.responsibility.description).toContain(
			'Use mine for commitments made by the user'
		);
	});

	it('rejects an empty todo due date at the agent boundary', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'create_todo');
		expect(
			definition?.parameters.safeParse({
				projectId: crypto.randomUUID(),
				title: 'Ship',
				responsibility: 'mine',
				dueDate: ''
			}).success
		).toBe(false);
	});

	it('tells the model that project ids are tool-returned UUIDs rather than names', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'search');
		expect(definition?.parameters.shape.projectId.description).toContain(
			'never pass a project name'
		);
	});

	it('tells the model that note ids cannot be titles or project ids', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'get_note');
		expect(definition?.parameters.shape.noteId.description).toContain(
			'never pass a title or project id'
		);
	});

	it('advertises confidence as an integer percentage', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'propose_memory_change');
		expect(definition?.parameters.shape.confidence.description).toContain(
			'integer percentage from 0 to 100'
		);
	});

	it('advertises which memory proposal identifiers must be omitted', () => {
		const definition = registry('auto_accept')
			.definitions()
			.find((candidate) => candidate.name === 'propose_memory_change');
		expect({
			projectId: definition?.parameters.shape.projectId.description,
			memoryEntryId: definition?.parameters.shape.memoryEntryId.description
		}).toEqual({
			projectId: 'Required for project scope; omit entirely for user scope.',
			memoryEntryId: 'Required for update or remove; omit entirely for add.'
		});
	});
});

/**
 * The id the run correlates a settled call by. It used to reach the executor as
 * `String(details?.toolCall?.callId ?? '')`, so a call the provider sent no id
 * for arrived as a value rather than as an absence — and the Agent controller
 * keys its successful mutations by exactly this string, where a second id-less
 * mutation overwrote the first.
 */
describe('The provider call id', () => {
	const recordedCallIds = (): {
		executor: AgentToolCompletionObserver;
		seen: { readonly callId?: string }[];
	} => {
		const seen: { readonly callId?: string }[] = [];
		return {
			seen,
			executor: {
				completed: async (input) => {
					seen.push(input);
				}
			}
		};
	};

	const invokeListProjects = async (
		executor: AgentToolCompletionObserver,
		details?: Parameters<FunctionTool['invoke']>[2]
	): Promise<void> => {
		const { factory } = agentProjectsFixture();
		const selected = createAgentTools(
			factory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Help' },
				model: 'openai/gpt-5.6'
			},
			executor
		)
			.agentTools(['list_projects'])
			.find((candidate) => candidate.name === 'list_projects') as FunctionTool;
		await selected.invoke({} as never, JSON.stringify({}), details);
	};

	it('is absent from the executor call when the provider sent none', async () => {
		const { executor, seen } = recordedCallIds();
		await invokeListProjects(executor);
		expect(seen.map((input) => 'callId' in input)).toEqual([false]);
	});

	it('is passed through unchanged when the provider sent one', async () => {
		const { executor, seen } = recordedCallIds();
		await invokeListProjects(executor, { toolCall: { callId: 'call-7' } } as never);
		expect(seen.map((input) => input.callId)).toEqual(['call-7']);
	});
});

describe('Explicit mutation receipts', () => {
	it('reports the pinned skill state after saving it', async () => {
		const { controller, note, skills } = loadedSkillFixture();
		const factory = capabilityDependencies<ControllerFactory>({ skills: () => controller });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'set_skill_pinned');
		const input = { noteId: note.id, projectId: note.projectId, pinned: true };
		const receipt = await tool?.prepare(input).execute();
		expect({ receipt, pins: skills.pins }).toEqual({
			receipt: input,
			pins: [{ skillNoteId: note.id, projectId: note.projectId }]
		});
	});

	it('reports the revoked token id', async () => {
		const tokens = new AccessTokens(
			new InMemoryApiTokenRepository([testTokenUser(testActor().userId)])
		);
		const minted = await tokens.mint(testActor().userId, {
			name: 'Local integration',
			scope: 'read'
		});
		const apiTokens = new ApiTokens({ ...agentToolResultsFixture(), tokens });
		const factory = capabilityDependencies<ControllerFactory>({ apiTokens: () => apiTokens });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'revoke_api_token');
		const receipt = await tool?.prepare({ tokenId: minted.token.id }).execute();
		expect({ receipt, verified: await tokens.verify(`Bearer ${minted.plaintext}`) }).toEqual({
			receipt: { tokenId: minted.token.id, name: 'Local integration', revoked: true },
			verified: null
		});
	});

	it('reports the deleted artifact id', async () => {
		const { service, notes, artifacts } = exportControllerFixture();
		notes.notes = [noteBuilder()];
		const { artifact } = await service.generateDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Report',
			format: 'pdf'
		});
		const factory = capabilityDependencies<ControllerFactory>({ deliverables: () => service });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'delete_artifact');
		const receipt = await tool?.prepare({ artifactId: artifact.id }).execute();
		expect({ receipt, artifacts: artifacts.artifacts }).toEqual({
			receipt: { artifactId: artifact.id, title: 'Report', deleted: true },
			artifacts: []
		});
	});

	it('fails visibly when an artifact does not exist', async () => {
		const { service } = exportControllerFixture();
		const factory = capabilityDependencies<ControllerFactory>({ deliverables: () => service });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((tool) => tool.name === 'get_artifact');
		await expect(
			tool?.prepare({ artifactId: '5b7e8904-6a3c-4d25-9f48-4a88e6f0c235' }).execute()
		).rejects.toThrow('Artifact not found');
	});
});

describe('Doomed note edits never reach the approval boundary', () => {
	const noteWithBody = (markdown: string, kind: 'note' | 'skill' = 'note') =>
		noteBuilder({
			id: crypto.randomUUID() as never,
			kind,
			title: 'Knowledge layer',
			document: noteMarkdown.read(markdown).document,
			plainText: noteMarkdown.read(markdown).plainText
		});

	const notesFactory = (note: ReturnType<typeof noteBuilder>) => reviewedNoteFixture(note).factory;

	const directTool = (name: 'edit_note' | 'edit_skill', note: ReturnType<typeof noteBuilder>) =>
		registry('approval_required', {
			factory: notesFactory(note)
		})
			.tools()
			.find((candidate) => candidate.name === name) as FunctionTool;

	const edits = (noteId: string, oldText: string, newText = 'replacement') => ({
		noteId,
		edits: [{ oldText, newText }]
	});

	// Invariant: the user is only ever asked to approve a note-body edit that can
	// actually apply. A doomed edit must fail in-turn for the model to recover
	// from, not park the run and cost a fresh trace and replayed transcript.

	it('still parks an approval on an edit_note whose oldText exists in the note', async () => {
		const note = noteWithBody('# Knowledge layer\n\nReplace this sentence.');
		const selected = directTool('edit_note', note);
		expect(
			await selected.needsApproval(
				{} as never,
				edits(note.id, 'Replace this sentence.') as never,
				'call-1'
			)
		).toBe(true);
	});

	it('does not park an approval on an edit_note whose oldText is absent from the note', async () => {
		const note = noteWithBody('# Knowledge layer\n\nReplace this sentence.');
		const selected = directTool('edit_note', note);
		expect(
			await selected.needsApproval(
				{} as never,
				edits(note.id, 'This sentence is not in the note.') as never,
				'call-1'
			)
		).toBe(false);
	});

	it('does not park an approval on an edit_skill whose oldText is absent from the skill', async () => {
		const skill = noteWithBody('Number every finding.', 'skill');
		const selected = directTool('edit_skill', skill);
		expect(
			await selected.needsApproval(
				{} as never,
				edits(skill.id, 'This sentence is not in the skill.') as never,
				'call-1'
			)
		).toBe(false);
	});
});

describe('Deselected tools', () => {
	const without = memoizeAgentTools(
		(...disabled: string[]) => `without:${disabled.join(',')}`,
		(...disabled: string[]): AgentToolSurface => {
			const policy: ToolAccessPolicy = { isEnabled: (name) => !disabled.includes(name) };
			return createAgentToolSurface(
				testTokenizer,
				{} as ControllerFactory,
				testActor(),
				'auto_accept',
				{
					provenanceId: testProvenanceId(),
					input: { conversationId: testConversationId(), prompt: 'Help' },
					model: 'openai/gpt-5.6'
				},
				executeDirectly,
				new InMemoryToolRetriever(),
				policy
			);
		}
	);

	it('removes only the deselected tool from definitions and search', () => {
		const available = without('archive_project');
		const definitions = available.definitions().map((definition) => definition.name);
		const catalog = available.catalog().map((tool) => tool.name);
		expect({
			definitionHasArchive: definitions.includes('archive_project'),
			catalogHasArchive: catalog.includes('archive_project'),
			definitionKeepsCreate: definitions.includes('create_note')
		}).toEqual({
			definitionHasArchive: false,
			catalogHasArchive: false,
			definitionKeepsCreate: true
		});
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

	// With no wrapper tool to dispatch by name, a deselected tool has to be absent
	// from the surface itself — including when something claims it was already
	// promoted, which must not resurrect a capability the user turned off.
	it('never surfaces a deselected tool, even if it is claimed as promoted', async () => {
		const surface = without('archive_project').agentTools(['archive_project']);
		expect(surface.map((candidate) => candidate.name)).not.toContain('archive_project');
	});
});

it('retains the fifteen-tool discovery ceiling for the agent', async () => {
	const tool = indirectToolFor('auto_accept', 'search_tools', {
		retriever: new InMemoryToolRetriever()
	});
	if (!tool || tool.type !== 'function') throw new Error('Missing search_tools');
	const input = { query: 'notes', limit: 16 };
	await tool.needsApproval({} as never, input as never, 'search-over-limit');
	const result = await tool.invoke({} as never, JSON.stringify(input), {
		toolCall: {
			type: 'function_call',
			callId: 'search-over-limit',
			name: 'search_tools',
			arguments: JSON.stringify(input)
		}
	});
	expect(result).toMatchObject({ code: 'VALIDATION' });
});

it('keeps promotions inside the SDK tool set that discovered them', async () => {
	const retriever = new InMemoryToolRetriever();
	retriever.names = ['create_note'];
	const available = createAgentTools(
		capabilityDependencies<ControllerFactory>({}),
		testActor(),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Create a note' },
			model: 'openai/gpt-5.6'
		},
		executeDirectly,
		retriever
	);
	const first = available.agentTools();
	const second = available.agentTools();
	const search = first.find((tool) => tool.name === 'search_tools');
	if (!search || search.type !== 'function') throw new Error('Missing search_tools');
	await search.invoke(new RunContext(), JSON.stringify({ query: 'create a note' }));
	expect({
		first: (await enabledToolNames(first)).includes('create_note'),
		second: (await enabledToolNames(second)).includes('create_note')
	}).toEqual({ first: true, second: false });
});
