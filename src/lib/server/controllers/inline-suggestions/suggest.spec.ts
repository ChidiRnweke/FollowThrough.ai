import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { InlineCompletionContext, InlineSuggestionRequest } from '$lib/models/agent';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	InlineCompletionContextBuilder,
	InlineCompletionGenerator,
	InlineSuggestionThrottle
} from '$lib/server/services/agent/runs/contracts';
import type { AgentPreferencesStore } from '$lib/server/services/agent/runs/preferences';
import type { NoteReader } from '$lib/server/services/notes/catalog';
import { noteBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { InlineSuggestions, type InlineSuggestionsDependencies } from './controller';

const actor = { userId: 'user-1' } as ActorContext;
const emptyContext: InlineCompletionContext = {
	noteTitle: 'Migration',
	noteText: 'Saved note text',
	userMemory: [],
	projectPassages: []
};

const request = (overrides: Partial<InlineSuggestionRequest> = {}): InlineSuggestionRequest => ({
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: 'note-1' as NoteId,
	projectId: 'untrusted-project' as ProjectId,
	revision: 2,
	blockType: 'paragraph',
	headingPath: ['Migration'],
	currentSection: 'The migration plan should account for the read-replica cutover',
	prefix: 'The migration plan should account for the read-replica cutover',
	suffix: '',
	...overrides
});

class ContextBuilder implements InlineCompletionContextBuilder {
	constructor(
		private readonly buildContext: (
			request: InlineSuggestionRequest,
			note: Note
		) => InlineCompletionContext = () => emptyContext
	) {}
	async build(
		_actor: ActorContext,
		input: InlineSuggestionRequest,
		note: Note
	): Promise<InlineCompletionContext> {
		return this.buildContext(input, note);
	}
}

class Generator implements InlineCompletionGenerator {
	constructor(
		private readonly generate: (context: InlineCompletionContext) => string = () => ' window.'
	) {}
	async complete(
		_request: InlineSuggestionRequest,
		context: InlineCompletionContext
	): Promise<string> {
		return this.generate(context);
	}
}

class OpenThrottle implements InlineSuggestionThrottle {
	released = false;
	consumed = false;
	admit() {
		return { allowed: true as const };
	}
	consume() {
		this.consumed = true;
		return { allowed: true as const };
	}
	release(): void {
		this.released = true;
	}
}

class ClosedThrottle implements InlineSuggestionThrottle {
	admit() {
		return { allowed: false as const, reason: 'busy' as const, retryAfterMs: 250 };
	}
	consume() {
		return { allowed: true as const };
	}
	release(): void {}
}

const preferencesWith = (inlineSuggestionsEnabled: boolean): AgentPreferencesStore => ({
	get: async () => ({
		userId: actor.userId,
		executionMode: 'approval_required',
		inlineSuggestionsEnabled,
		createdAt: testNow,
		updatedAt: testNow
	}),
	update: async (_actor, input) => ({
		userId: actor.userId,
		executionMode: input.executionMode ?? 'approval_required',
		inlineSuggestionsEnabled: input.inlineSuggestionsEnabled ?? inlineSuggestionsEnabled,
		createdAt: testNow,
		updatedAt: testNow
	})
});

const noteReader: NoteReader = {
	get: async (_actor, noteId) =>
		noteBuilder({ id: noteId, projectId: 'project-1' as ProjectId, plainText: 'Saved note text' })
};

const controller = (overrides: Partial<InlineSuggestionsDependencies> = {}) =>
	new InlineSuggestions({
		inlineCompletionGenerator: new Generator(),
		inlineCompletionContextBuilder: new ContextBuilder(),
		inlineSuggestionThrottle: new OpenThrottle(),
		noteReader,
		preferences: preferencesWith(true),
		...overrides
	});

const signal = () => new AbortController().signal;

describe('direct inline completion', () => {
	it('returns nothing when the passage is too short', async () => {
		expect(await controller().suggest(actor, request({ prefix: 'Hi' }), signal())).toEqual({
			outcome: 'no_suggestion',
			reason: 'ineligible'
		});
	});

	it('returns completion text even when project retrieval is empty', async () => {
		expect(await controller().suggest(actor, request(), signal())).toEqual({
			outcome: 'suggested',
			text: ' window.',
			grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 0 }
		});
	});

	it('reports project retrieval without gating completion', async () => {
		const context = {
			...emptyContext,
			projectPassages: [
				{ sourceTitle: 'Runbook', sourceType: 'note' as const, content: 'Ana owns the cutover.' }
			]
		};
		expect(
			await controller({
				inlineCompletionContextBuilder: new ContextBuilder(() => context)
			}).suggest(actor, request(), signal())
		).toEqual({
			outcome: 'suggested',
			text: ' window.',
			grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 1 }
		});
	});

	it('uses the authoritative note project', async () => {
		const result = await controller({
			inlineCompletionContextBuilder: new ContextBuilder((input) => ({
				...emptyContext,
				noteTitle: input.projectId ?? 'missing'
			})),
			inlineCompletionGenerator: new Generator((context) => context.noteTitle)
		}).suggest(actor, request(), signal());
		expect(result.outcome === 'suggested' ? result.text : '').toBe('project-1');
	});

	it('passes the authoritative full note to context assembly', async () => {
		const result = await controller({
			inlineCompletionContextBuilder: new ContextBuilder((_input, note) => ({
				...emptyContext,
				noteText: note.plainText
			})),
			inlineCompletionGenerator: new Generator((context) => context.noteText)
		}).suggest(actor, request(), signal());
		expect(result.outcome === 'suggested' ? result.text : '').toBe('Saved note text');
	});

	it('returns nothing when inline completion is disabled', async () => {
		expect(
			await controller({ preferences: preferencesWith(false) }).suggest(actor, request(), signal())
		).toEqual({ outcome: 'no_suggestion', reason: 'ineligible' });
	});

	it('returns nothing for an archived note', async () => {
		expect(
			await controller({
				noteReader: {
					get: async (_actor, noteId) => noteBuilder({ id: noteId, archivedAt: testNow })
				}
			}).suggest(actor, request(), signal())
		).toEqual({ outcome: 'no_suggestion', reason: 'ineligible' });
	});

	it('returns nothing when the spend guard refuses the request', async () => {
		expect(
			await controller({ inlineSuggestionThrottle: new ClosedThrottle() }).suggest(
				actor,
				request(),
				signal()
			)
		).toEqual({ outcome: 'busy', retryAfterMs: 250 });
	});

	it('releases the spend guard when completion fails', async () => {
		const throttle = new OpenThrottle();
		const failing: InlineCompletionGenerator = {
			complete: async () => {
				throw new Error('provider down');
			}
		};
		await controller({
			inlineSuggestionThrottle: throttle,
			inlineCompletionGenerator: failing
		})
			.suggest(actor, request(), signal())
			.catch(() => undefined);
		expect(throttle.released).toBe(true);
	});

	it('releases concurrency without consuming budget when retrieval aborts', async () => {
		const throttle = new OpenThrottle();
		const abortingBuilder: InlineCompletionContextBuilder = {
			build: async () => {
				throw new DOMException('stale caret', 'AbortError');
			}
		};
		await controller({
			inlineSuggestionThrottle: throttle,
			inlineCompletionContextBuilder: abortingBuilder
		})
			.suggest(actor, request(), signal())
			.catch(() => undefined);
		expect({ released: throttle.released, consumed: throttle.consumed }).toEqual({
			released: true,
			consumed: false
		});
	});
});
