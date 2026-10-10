import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { loadedSkillFixture } from '$lib/testing/skills/fixtures/loaded-skill';
import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { TodoBatchReceipts } from '$lib/server/services/todos/batch-receipts';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { InMemoryTodoBatchReceipts } from '$lib/testing/todos/fakes/in-memory-todo-batch-receipts';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import type { FunctionTool, Tool } from '@openai/agents';
import type { TextSelection } from '$lib/models/notes';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { ProjectsController } from '$lib/server/controllers/projects/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag } from '$lib/models/notes';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import {
	appContextBuilder,
	noteBuilder,
	testProjectId,
	testConversationId,
	testDiagramId,
	testActor,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	AgentTools,
	McpTools,
	agentToolCoverage,
	agentToolRegistry,
	type ToolAccessPolicy,
	type AgentToolDefinition
} from './agent-tool-factory';
import type { AgentToolContractBinding } from '$lib/models/agent';
import type { ToolClassification } from '$lib/models/agent';
import { toolFailureSchema } from '$lib/models/agent/tool-failure';
import {
	TOOL_DESCRIPTIONS,
	LOCKED_TOOL_NAMES,
	type ToolName
} from '$lib/models/agent/tool-catalog';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';

const executeDirectly: AgentToolExecutor = {
	execute: (_input, action) => action()
};
const allTools: ToolAccessPolicy = { isEnabled: () => true };

const createAgentTools = (
	controllers: ConstructorParameters<typeof AgentTools>[1],
	actor: ConstructorParameters<typeof AgentTools>[2],
	mode: ConstructorParameters<typeof AgentTools>[3],
	context: ConstructorParameters<typeof AgentTools>[4],
	executor: AgentToolExecutor = executeDirectly,
	retriever: InMemoryToolRetriever = new InMemoryToolRetriever(),
	access: ToolAccessPolicy = allTools
): AgentTools =>
	new AgentTools(testTokenizer, controllers, actor, mode, context, executor, retriever, access);

let freshKeyCounter = 0;
const freshKey = (): string => `fresh:${freshKeyCounter++}`;

const definitionsCacheKey = (options: { classifications?: readonly ToolClassification[] } = {}) =>
	JSON.stringify(options.classifications ?? null);

const memoizedResult = <Args extends unknown[], Result>(
	cache: Map<string, Result>,
	args: Args,
	build: () => Result
): Result => {
	const key = JSON.stringify(args);
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const value = build();
	cache.set(key, value);
	return value;
};

/**
 * The registry is pure and deterministic for a given set of constructor args, so
 * a whole test file can share one built instance and one set of method results.
 * Custom factory/retriever args and any test that invokes `search_tools` must
 * stay fresh: the former capture per-test state, the latter mutates a promotion
 * set that every subsequent test on that registry would otherwise inherit.
 */
class MemoizedAgentTools extends AgentTools {
	private readonly definitionsResults = new Map<string, AgentToolDefinition[]>();
	private readonly toolsResults = new Map<string, Tool<unknown>[]>();
	private readonly agentToolsResults = new Map<string, Tool<unknown>[]>();
	private readonly offeredResults = new Map<string, ToolName[]>();

	constructor(...args: ConstructorParameters<typeof AgentTools>) {
		super(...args);
	}

	override definitions(
		options: { classifications?: readonly ToolClassification[] } = {}
	): AgentToolDefinition[] {
		return memoizedResult(this.definitionsResults, [definitionsCacheKey(options)], () =>
			super.definitions(options)
		);
	}

	override tools(
		options: { classifications?: readonly ToolClassification[] } = {}
	): Tool<unknown>[] {
		return memoizedResult(this.toolsResults, [definitionsCacheKey(options)], () =>
			super.tools(options)
		);
	}

	override agentTools(alreadyPromoted: readonly string[] = []): Tool<unknown>[] {
		return memoizedResult(this.agentToolsResults, [alreadyPromoted.join('\u0000')], () =>
			super.agentTools(alreadyPromoted)
		);
	}

	override offeredToolNames(alreadyPromoted: readonly string[] = []): ToolName[] {
		return memoizedResult(this.offeredResults, [alreadyPromoted.join('\u0000')], () =>
			super.offeredToolNames(alreadyPromoted)
		);
	}
}

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
		new MemoizedAgentTools(
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
		new MemoizedAgentTools(
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
	/** Records which acceptance the tool reached for, without a mocking library. */
	const recordingSuggestions = () => {
		const called: string[] = [];
		const factory = {
			suggestions: () => ({
				accept: async () => {
					called.push('accept');
					return {};
				},
				acceptReviewed: async () => {
					called.push('acceptReviewed');
					return {};
				}
			})
		} as unknown as ControllerFactory;
		return { called, factory };
	};

	const acceptWith = async (factory: ControllerFactory): Promise<void> => {
		const tool = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Accept it' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'accept_suggestion');
		await tool?.prepare({ suggestionId: '9f1c2f18-0b1a-4a5e-9c3d-2f7b8e4a1d55' }).execute();
	};

	// Bound to the raw `accept`, this tool was the only caller in the system that
	// could mint a draw.io diagram with no preview: the guard that refuses one
	// lives in `acceptReviewed`, and the UI has always gone through it.
	it('goes through the reviewed acceptance that guards draw.io', async () => {
		const { called, factory } = recordingSuggestions();
		await acceptWith(factory);
		expect(called).toEqual(['acceptReviewed']);
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
		const mcp = new McpTools(
			testTokenizer,
			{} as ControllerFactory,
			testActor(),
			{ provenanceId: testProvenanceId() },
			allTools
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
		const noteId = crypto.randomUUID();
		let received: unknown;
		const factory = {
			retrieval: () => ({
				search: async (_actor: unknown, input: unknown) => {
					received = input;
					return [];
				}
			})
		} as unknown as ControllerFactory;
		const searchNote = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Find in this note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'search_note');
		await searchNote?.prepare({ noteId, query: 'messaging' }).execute();
		expect(received).toEqual({ query: 'messaging', noteId });
	});

	it('read_canvas_diagram uses the resolved run conversation', async () => {
		const conversationId = testConversationId(7);
		const diagramStudio = capabilityDependencies<DiagramStudioController>({
			readCanvasDiagram: async (_actor, input) =>
				input.conversationId === conversationId
					? {
							kind: 'present',
							diagramId: testDiagramId(),
							source: '<mxfile />',
							title: 'Current'
						}
					: {
							kind: 'empty',
							message: 'Empty',
							nextActions: [{ tool: 'create_diagram', reason: 'Create one' }]
						}
		});
		const factory = capabilityDependencies<ControllerFactory>({
			diagramStudio: () => diagramStudio
		});
		const tool = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId, prompt: 'Read the canvas' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'read_canvas_diagram');
		expect(await tool?.prepare({}).execute()).toEqual({
			kind: 'present',
			diagramId: testDiagramId(),
			source: '<mxfile />',
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
					etag: noteEtag(note.id, note.currentRevision),
					backlinks: [{ id: 'bl' }],
					references: [{ id: 'ref' }],
					diagrams: [{ id: 'dg' }],
					todos: [{ id: 'td' }],
					pendingSuggestions: [{ id: 'sg' }]
				})
			})
		} as unknown as ControllerFactory;
		const getNote = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Read a note' },
			model: 'openai/gpt-5.6'
		})
			.definitions()
			.find((definition) => definition.name === 'get_note');
		const result = await getNote?.prepare({ noteId: note.id }).execute();
		expect(result).toMatchObject({
			noteId: note.id,
			title: note.title,
			etag: noteEtag(note.id, note.currentRevision),
			backlinks: [{ id: 'bl' }],
			references: [{ id: 'ref' }],
			diagrams: [{ id: 'dg' }],
			todos: [{ id: 'td' }],
			pendingSuggestions: [{ id: 'sg' }],
			body: {
				kind: 'file',
				file: {
					path: `/projects/${note.projectId}/notes/${note.id}.md`,
					mediaType: 'text/markdown',
					byteSize: expect.any(Number),
					lineCount: expect.any(Number),
					tokenCount: expect.any(Number)
				}
			}
		});
		expect(result).not.toHaveProperty('document');
		expect(result).not.toHaveProperty('note');
		expect(result).not.toHaveProperty('plainText');
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
			new InMemoryToolRetriever(),
			testTokenizer
		)({
			actor: testActor(),
			request: { prompt: 'Help' } as never,
			run: run as never,
			executor: { execute: async (_input, action) => action() },
			signal: new AbortController().signal
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
		const selected = directToolFor('auto_accept', 'list_projects', { factory });
		const result = await selected.invoke({} as never, JSON.stringify({}));
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
		const result = await directToolFor('auto_accept', 'list_projects', { factory }).invoke(
			{} as never,
			JSON.stringify({
				createdAfter: '2026-02-01T00:00:00.000Z',
				createdBefore: '2026-02-01T00:00:00.000Z'
			})
		);
		expect(result).toEqual({
			projects: [{ id: 'second', name: 'Second', createdAt: '2026-02-01T00:00:00.000Z' }]
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
		let received: unknown;
		const factory = {
			retrieval: () => ({
				search: async (_actor: unknown, input: unknown) => {
					received = input;
					return [];
				}
			})
		} as unknown as ControllerFactory;
		await directToolFor('auto_accept', 'search', { factory }).invoke(
			{} as never,
			JSON.stringify({
				query: 'deployment procedures',
				projectId: '',
				createdAfter: '',
				createdBefore: ''
			})
		);
		expect(received).toEqual({ query: 'deployment procedures' });
	});

	it('treats blank optional todo filters as omitted', async () => {
		let received: unknown;
		const projectId = crypto.randomUUID();
		const noteId = crypto.randomUUID();
		const factory = {
			todos: () => ({
				list: async (_actor: unknown, input: unknown) => {
					received = input;
					return { todos: [] };
				}
			})
		} as unknown as ControllerFactory;
		await directToolFor('auto_accept', 'list_todos', { factory }).invoke(
			{} as never,
			JSON.stringify({
				projectId,
				noteId,
				status: '',
				responsibility: '',
				dueBefore: '',
				createdAfter: '',
				createdBefore: ''
			})
		);
		expect(received).toEqual({ projectId, noteId });
	});

	it('shares the saved task batch across agent and MCP retries', async () => {
		const todos = new InMemoryTodos();
		const receipts = new InMemoryTodoBatchReceipts();
		const controller = new Todos(
			capabilityDependencies<TodosDependencies>({
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
		const mcp = new McpTools(
			testTokenizer,
			factory,
			testActor(),
			{ provenanceId: testProvenanceId() },
			allTools
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
	const groundingFixture = () => {
		let reached = false;
		const factory = {
			workspace: () => ({
				getShellContext: async () => {
					reached = true;
					return { projects: [], notes: [] };
				}
			})
		} as unknown as ControllerFactory;
		return {
			reached: () => reached,
			tool: directToolFor('auto_accept', 'get_workspace_context', { factory })
		};
	};

	it('treats a blank call to an argument-free tool as an empty object', async () => {
		const fixture = groundingFixture();
		await fixture.tool.invoke({} as never, '');
		expect(fixture.reached()).toBe(true);
	});

	it('still rejects malformed non-empty arguments', async () => {
		const fixture = groundingFixture();
		await fixture.tool.invoke({} as never, '{"noteId":');
		expect(fixture.reached()).toBe(false);
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
		let received: unknown;
		const factory = {
			notes: () => ({
				create: async (actor: unknown, input: unknown) => {
					received = { actor, input };
					return { note: { id: 'note-1' } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Create a note' },
			model: 'openai/gpt-5.6'
		})
			.tools()
			.find((candidate) => candidate.name === 'create_note') as FunctionTool;
		await selected.invoke(
			{} as never,
			JSON.stringify({ title: 'Agent draft', projectId: testProjectId() })
		);
		expect(received).toEqual({
			actor: testActor(),
			input: { title: 'Agent draft', projectId: testProjectId() }
		});
	});

	it('uses the effective conversation model for reference search', async () => {
		let receivedModel: string | undefined;
		let receivedInput: unknown;
		const factory = {
			references: () => ({
				suggestFromSelection: async (
					_actor: unknown,
					input: unknown,
					options?: { model?: string }
				) => {
					receivedInput = input;
					receivedModel = options?.model;
					return { outcome: 'nothing_relevant' };
				}
			})
		} as unknown as ControllerFactory;
		const selected = createAgentTools(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: {
				conversationId: testConversationId(),
				prompt: 'Find references',
				selection: authoritativeSelection
			},
			model: 'anthropic/claude-sonnet-4.5'
		})
			.tools()
			.find((candidate) => candidate.name === 'find_references') as FunctionTool;
		await selected.invoke({} as never, '{}');
		expect({ receivedModel, receivedInput }).toEqual({
			receivedModel: 'anthropic/claude-sonnet-4.5',
			receivedInput: { selection: authoritativeSelection }
		});
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
		executor: AgentToolExecutor;
		seen: { readonly callId?: string }[];
	} => {
		const seen: { readonly callId?: string }[] = [];
		return {
			seen,
			executor: {
				execute: async (input, action) => {
					seen.push(input);
					return action();
				}
			}
		};
	};

	const invokeListProjects = async (
		executor: AgentToolExecutor,
		details?: Parameters<FunctionTool['invoke']>[2]
	): Promise<void> => {
		const factory = capabilityDependencies<ControllerFactory>({
			projects: () =>
				capabilityDependencies<ProjectsController>({ list: async () => ({ projects: [] }) })
		});
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
		const skills = capabilityDependencies<SkillsController>({ setPinned: async () => undefined });
		const factory = capabilityDependencies<ControllerFactory>({ skills: () => skills });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((definition) => definition.name === 'set_skill_pinned');
		const input = {
			noteId: '9f1c2f18-0b1a-4a5e-9c3d-2f7b8e4a1d55',
			projectId: '8e0b1a27-9c2d-4f18-8a5e-1d55b3c7f902',
			pinned: true
		};
		expect(await tool?.prepare(input).execute()).toEqual(input);
	});

	it('reports the revoked token id', async () => {
		const apiTokens = capabilityDependencies<ApiTokensController>({
			revoke: async (_actor, id) => ({ id, name: 'Local integration' })
		});
		const factory = capabilityDependencies<ControllerFactory>({ apiTokens: () => apiTokens });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((definition) => definition.name === 'revoke_api_token');
		expect(
			await tool?.prepare({ tokenId: '7d9a0b16-8c3e-4f27-9b5a-2e66c4d8a013' }).execute()
		).toEqual({
			tokenId: '7d9a0b16-8c3e-4f27-9b5a-2e66c4d8a013',
			name: 'Local integration',
			revoked: true
		});
	});

	it('reports the deleted artifact id', async () => {
		const deliverables = capabilityDependencies<DeliverablesController>({
			deleteArtifact: async (_actor, id) => ({ id, title: 'Report' })
		});
		const factory = capabilityDependencies<ControllerFactory>({ deliverables: () => deliverables });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((definition) => definition.name === 'delete_artifact');
		expect(
			await tool?.prepare({ artifactId: '6c8f9a05-7b4d-4e36-8a59-3f77d5e9b124' }).execute()
		).toEqual({
			artifactId: '6c8f9a05-7b4d-4e36-8a59-3f77d5e9b124',
			title: 'Report',
			deleted: true
		});
	});

	it('fails visibly when an artifact does not exist', async () => {
		const deliverables = capabilityDependencies<DeliverablesController>({
			getArtifact: async () => undefined
		});
		const factory = capabilityDependencies<ControllerFactory>({ deliverables: () => deliverables });
		const tool = registry('auto_accept', { factory })
			.definitions()
			.find((definition) => definition.name === 'get_artifact');
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
			document: noteContentFromMarkdown(markdown).document,
			plainText: noteContentFromMarkdown(markdown).plainText
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
		(...disabled: string[]): AgentTools => {
			const policy: ToolAccessPolicy = { isEnabled: (name) => !disabled.includes(name) };
			return new MemoizedAgentTools(
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
