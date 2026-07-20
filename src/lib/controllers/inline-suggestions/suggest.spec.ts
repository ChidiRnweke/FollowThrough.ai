import { describe, it, expect } from 'vitest';
import type {
	ActorContext,
	InlineContextBrief,
	InlineSuggestionRequest,
	NoteId,
	ProjectId
} from '$lib/models';
import type {
	InlineBriefCache,
	InlineCompletionGenerator,
	InlineContextBriefer,
	InlineSuggestionThrottle
} from '$lib/services';
import {
	DefaultInlineSuggestionsController,
	type InlineSuggestionsDependencies
} from './controller';

const actor: ActorContext = { userId: 'user-1' } as ActorContext;

const request = (overrides: Partial<InlineSuggestionRequest> = {}): InlineSuggestionRequest => ({
	noteId: 'note-1' as NoteId,
	projectId: 'project-1' as ProjectId,
	revision: 2,
	prefix: 'The migration plan should account for the read-replica cutover',
	suffix: '',
	...overrides
});

const brief: InlineContextBrief = {
	voice: 'terse',
	facts: ['Ana owns the cutover'],
	openThreads: [],
	avoid: []
};

class RecordingGenerator implements InlineCompletionGenerator {
	calls = 0;
	receivedBrief: InlineContextBrief | undefined;
	constructor(private readonly text = ' window.') {}
	async complete(
		_request: InlineSuggestionRequest,
		received: InlineContextBrief | undefined
	): Promise<string> {
		this.calls++;
		this.receivedBrief = received;
		return this.text;
	}
}

class StubCache implements InlineBriefCache {
	readonly stored = new Map<string, InlineContextBrief>();
	constructor(private readonly initial?: InlineContextBrief) {}
	get(): InlineContextBrief | undefined {
		return this.initial;
	}
	set(key: string, value: InlineContextBrief): void {
		this.stored.set(key, value);
	}
}

class StubBriefer implements InlineContextBriefer {
	calls = 0;
	constructor(private readonly result: () => Promise<InlineContextBrief>) {}
	async brief(): Promise<InlineContextBrief> {
		this.calls++;
		return this.result();
	}
}

class OpenThrottle implements InlineSuggestionThrottle {
	released = 0;
	admit(): boolean {
		return true;
	}
	release(): void {
		this.released++;
	}
}

class ClosedThrottle implements InlineSuggestionThrottle {
	admit(): boolean {
		return false;
	}
	release(): void {}
}

const controller = (overrides: Partial<InlineSuggestionsDependencies> = {}) =>
	new DefaultInlineSuggestionsController({
		inlineCompletionGenerator: new RecordingGenerator(),
		inlineContextBriefer: new StubBriefer(async () => brief),
		inlineBriefCache: new StubCache(),
		inlineBriefKey: () => 'key-1',
		inlineSuggestionThrottle: new OpenThrottle(),
		...overrides
	});

const signal = () => new AbortController().signal;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DefaultInlineSuggestionsController.suggest', () => {
	it('returns no suggestion for a passage too short to continue', async () => {
		expect(await controller().suggest(actor, request({ prefix: 'Hi' }), signal())).toEqual({
			text: '',
			grounded: false
		});
	});

	it('returns the generated continuation', async () => {
		const result = await controller().suggest(actor, request(), signal());
		expect(result.text).toBe(' window.');
	});

	it('reports a suggestion as grounded when a brief was already warm', async () => {
		const result = await controller({ inlineBriefCache: new StubCache(brief) }).suggest(
			actor,
			request(),
			signal()
		);
		expect(result.grounded).toBe(true);
	});

	it('reports a suggestion as ungrounded on a cache miss', async () => {
		const result = await controller().suggest(actor, request(), signal());
		expect(result.grounded).toBe(false);
	});

	it('passes a warm brief to the completion generator', async () => {
		const generator = new RecordingGenerator();
		await controller({
			inlineCompletionGenerator: generator,
			inlineBriefCache: new StubCache(brief)
		}).suggest(actor, request(), signal());
		expect(generator.receivedBrief).toEqual(brief);
	});

	it('does not run the briefing pass when a brief is already warm', async () => {
		const briefer = new StubBriefer(async () => brief);
		await controller({
			inlineBriefCache: new StubCache(brief),
			inlineContextBriefer: briefer
		}).suggest(actor, request(), signal());
		expect(briefer.calls).toBe(0);
	});

	it('caches the brief produced by a background briefing pass', async () => {
		const cache = new StubCache();
		await controller({ inlineBriefCache: cache }).suggest(actor, request(), signal());
		await settle();
		expect(cache.stored.get('key-1')).toEqual(brief);
	});

	it('still returns a suggestion when the briefing pass fails', async () => {
		const result = await controller({
			inlineContextBriefer: new StubBriefer(async () => {
				throw new Error('search unavailable');
			})
		}).suggest(actor, request(), signal());
		expect(result.text).toBe(' window.');
	});

	it('returns no suggestion when the throttle refuses the request', async () => {
		const result = await controller({ inlineSuggestionThrottle: new ClosedThrottle() }).suggest(
			actor,
			request(),
			signal()
		);
		expect(result).toEqual({ text: '', grounded: false });
	});

	it('does not call the model when the throttle refuses the request', async () => {
		const generator = new RecordingGenerator();
		await controller({
			inlineCompletionGenerator: generator,
			inlineSuggestionThrottle: new ClosedThrottle()
		}).suggest(actor, request(), signal());
		expect(generator.calls).toBe(0);
	});

	it('releases the throttle after the completion fails', async () => {
		const throttle = new OpenThrottle();
		const failing: InlineCompletionGenerator = {
			complete: async () => {
				throw new Error('provider down');
			}
		};
		await expect(
			controller({
				inlineSuggestionThrottle: throttle,
				inlineCompletionGenerator: failing
			}).suggest(actor, request(), signal())
		).rejects.toThrow('provider down');
		expect(throttle.released).toBe(1);
	});
});
