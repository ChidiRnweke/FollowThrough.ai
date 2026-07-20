import { describe, it, expect } from 'vitest';
import type {
	ActorContext,
	InlineContextBrief,
	InlineSuggestionRequest,
	ListMemoryInput,
	ListMemoryOutput,
	MemoryEntry,
	NoteId,
	ProjectId,
	SearchMatch
} from '$lib/models';
import type { ControllerFactory } from '$lib/factories';
import type { KnowledgeSearcher, Reranker } from '$lib/services';
import {
	plainPassage,
	RetrievalInlineContextBriefer,
	type InlineBriefCompletionClient
} from './inline-context-briefer';

const actor: ActorContext = { userId: 'user-1' } as ActorContext;
const projectId = 'project-1' as ProjectId;

const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: 'note-1' as NoteId,
	projectId,
	revision: 1,
	blockType: 'paragraph',
	headingPath: ['Migration'],
	currentSection: 'The read-replica cutover window is owned by',
	prefix: 'The read-replica cutover window is owned by',
	suffix: '',
	heading: 'Migration'
};

const noteMatch = (content: string): SearchMatch =>
	({
		score: 0.5,
		document: {
			id: `doc-${content}`,
			projectId,
			noteId: 'other-note' as NoteId,
			content,
			contentHash: 'h',
			sourceRevision: 1,
			chunkIndex: 0
		}
	}) as SearchMatch;

const memoryEntry = (id: string, content: string, project?: ProjectId): MemoryEntry =>
	({
		id,
		userId: 'user-1',
		...(project ? { projectId: project } : {}),
		content,
		shareWithAgents: true,
		createdAt: '1970-01-01T00:00:00.000Z',
		updatedAt: '1970-01-01T00:00:00.000Z'
	}) as MemoryEntry;

class FakeSearcher implements KnowledgeSearcher {
	receivedProjectId: ProjectId | undefined;
	constructor(private readonly matches: readonly SearchMatch[]) {}
	async search(
		_actor: ActorContext,
		_query: string,
		_limit?: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		this.receivedProjectId = projectId;
		return this.matches;
	}
}

class FakeReranker implements Reranker {
	received: readonly SearchMatch[] = [];
	constructor(
		private readonly behaviour: (matches: readonly SearchMatch[]) => readonly SearchMatch[]
	) {}
	async rerank(_query: string, matches: readonly SearchMatch[]): Promise<readonly SearchMatch[]> {
		this.received = matches;
		return this.behaviour(matches);
	}
}

class CapturingClient implements InlineBriefCompletionClient {
	lastUserMessage = '';
	constructor(private readonly brief: InlineContextBrief) {}
	readonly chat = {
		completions: {
			parse: async (body: {
				readonly messages: readonly { readonly role: string; readonly content: string }[];
			}) => {
				this.lastUserMessage = body.messages.find((m) => m.role === 'user')?.content ?? '';
				return { choices: [{ message: { parsed: this.brief } }] };
			}
		}
	};
}

const treeNode = (id: string, title: string) => ({
	entry: { id, projectId, kind: 'note', title, position: 0, isPinned: false },
	children: []
});

const fakeFactory = (opts: {
	project?: readonly MemoryEntry[];
	user?: readonly MemoryEntry[];
	tree?: readonly ReturnType<typeof treeNode>[];
}) =>
	({
		memory: () => ({
			list: async (_actor: ActorContext, input: ListMemoryInput): Promise<ListMemoryOutput> => ({
				entries: input.projectId ? (opts.project ?? []) : (opts.user ?? [])
			})
		}),
		projects: () => ({
			get: async () => ({ project: {}, tree: opts.tree ?? [] })
		})
	}) as unknown as ControllerFactory;

const memoryFactory = (project: readonly MemoryEntry[], user: readonly MemoryEntry[]) =>
	fakeFactory({ project, user });

const brief: InlineContextBrief = {
	voice: 'terse',
	facts: ['Ana owns the cutover'],
	openThreads: [],
	avoid: []
};

const build = (over: {
	searcher: KnowledgeSearcher;
	reranker: Reranker;
	factory: ControllerFactory;
	client: InlineBriefCompletionClient;
}) =>
	new RetrievalInlineContextBriefer({
		controllers: () => over.factory,
		searcher: over.searcher,
		reranker: over.reranker,
		client: over.client
	});

const signal = () => new AbortController().signal;

describe('RetrievalInlineContextBriefer', () => {
	it('scopes the knowledge search to the note project', async () => {
		const searcher = new FakeSearcher([noteMatch('a note fact')]);
		await build({
			searcher,
			reranker: new FakeReranker((m) => m),
			factory: memoryFactory([], []),
			client: new CapturingClient(brief)
		}).brief(actor, request, signal());
		expect(searcher.receivedProjectId).toBe(projectId);
	});

	it('feeds both notes and project memory into the reranker', async () => {
		const reranker = new FakeReranker((m) => m);
		await build({
			searcher: new FakeSearcher([noteMatch('a note fact')]),
			reranker,
			factory: memoryFactory([memoryEntry('m1', 'Ana owns the cutover', projectId)], []),
			client: new CapturingClient(brief)
		}).brief(actor, request, signal());
		const kinds = reranker.received.map((match) =>
			match.document.memoryEntryId ? 'memory' : 'note'
		);
		expect(kinds).toEqual(['note', 'memory']);
	});

	it('always includes user-profile memory even when the reranker drops everything', async () => {
		const client = new CapturingClient(brief);
		await build({
			searcher: new FakeSearcher([noteMatch('a note fact')]),
			reranker: new FakeReranker(() => []),
			factory: memoryFactory([], [memoryEntry('u1', 'Writes in British English')]),
			client
		}).brief(actor, request, signal());
		expect(client.lastUserMessage).toContain('Writes in British English');
	});

	it('labels project memory candidates as project memory in the prompt', async () => {
		const client = new CapturingClient(brief);
		await build({
			searcher: new FakeSearcher([]),
			reranker: new FakeReranker((m) => m),
			factory: memoryFactory([memoryEntry('m1', 'Ana owns the cutover', projectId)], []),
			client
		}).brief(actor, request, signal());
		expect(client.lastUserMessage).toContain('(project memory)');
	});

	it('still produces a brief when the reranker fails', async () => {
		const result = await build({
			searcher: new FakeSearcher([noteMatch('a note fact')]),
			reranker: new FakeReranker(() => {
				throw new Error('rerank down');
			}),
			factory: memoryFactory([], []),
			client: new CapturingClient(brief)
		}).brief(actor, request, signal());
		expect(result).toEqual(brief);
	});

	it('returns an empty brief without a model call when nothing is retrieved', async () => {
		const client = new CapturingClient(brief);
		const result = await build({
			searcher: new FakeSearcher([]),
			reranker: new FakeReranker((m) => m),
			factory: memoryFactory([], []),
			client
		}).brief(actor, request, signal());
		expect({ result, called: client.lastUserMessage }).toEqual({
			result: { voice: '', facts: [], openThreads: [], avoid: [] },
			called: ''
		});
	});

	it('deduplicates a memory entry that also arrives from the knowledge search', async () => {
		const reranker = new FakeReranker((m) => m);
		await build({
			searcher: new FakeSearcher([noteMatch('Ana owns the cutover')]),
			reranker,
			factory: memoryFactory([memoryEntry('m1', 'Ana owns the cutover', projectId)], []),
			client: new CapturingClient(brief)
		}).brief(actor, request, signal());
		expect(reranker.received).toHaveLength(1);
	});

	it('includes other project documents by title even when nothing is retrieved', async () => {
		const client = new CapturingClient(brief);
		await build({
			searcher: new FakeSearcher([]),
			reranker: new FakeReranker((m) => m),
			factory: fakeFactory({
				tree: [treeNode('note-1', 'This note'), treeNode('odyssey', 'The Odyssey')]
			}),
			client
		}).brief(actor, request, signal());
		expect(client.lastUserMessage).toContain('The Odyssey');
	});

	it('excludes the current note from the project document inventory', async () => {
		const client = new CapturingClient(brief);
		await build({
			searcher: new FakeSearcher([]),
			reranker: new FakeReranker((m) => m),
			factory: fakeFactory({
				tree: [treeNode('note-1', 'This note'), treeNode('odyssey', 'The Odyssey')]
			}),
			client
		}).brief(actor, request, signal());
		expect(client.lastUserMessage).not.toContain('This note');
	});
});

describe('plainPassage', () => {
	it('drops mermaid edge lines from the query', () => {
		expect(plainPassage('flowchart LR\n  A --> B\nreal prose here')).toBe('real prose here');
	});

	it('strips fenced code blocks', () => {
		expect(plainPassage('before\n```\nconst x = 1;\n```\nafter')).toBe('before\nafter');
	});

	it('keeps ordinary prose intact', () => {
		expect(plainPassage('The migration plan should account for the cutover.')).toBe(
			'The migration plan should account for the cutover.'
		);
	});
});
