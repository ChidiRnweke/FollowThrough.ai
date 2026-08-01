import { describe, expect, it } from 'vitest';
import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
import { createAskAgent, type AskAgentDependencies } from './responsive-surfaces';

class FakeAskAgentSurface implements AskAgentDependencies {
	fits = true;
	opened = false;
	staged?: ChatHandoff;
	carried?: ChatHandoff;
	href?: string;

	readonly panelFits = () => this.fits;
	readonly openChat = () => {
		this.opened = true;
	};
	readonly stage = (request: ChatHandoff) => {
		this.staged = request;
	};
	readonly handoff = (request: ChatHandoff) => {
		this.carried = request;
	};
	readonly navigate = (href: string) => {
		this.href = href;
	};
}

const request = { prompt: 'Connect these notes' };

describe('agent invocation surface', () => {
	it('opens chat beside content when the docked panel fits', () => {
		const surface = new FakeAskAgentSurface();
		createAskAgent(surface)(request);
		expect(surface.opened).toBe(true);
	});

	it('stages the prompt in the mounted docked chat', () => {
		const surface = new FakeAskAgentSurface();
		createAskAgent(surface)(request);
		expect(surface.staged).toEqual(request);
	});

	it('carries the prompt when chat needs a full-page navigation', () => {
		const surface = new FakeAskAgentSurface();
		surface.fits = false;
		createAskAgent(surface)(request);
		expect(surface.carried).toEqual(request);
	});

	it('navigates to a new chat when the docked panel does not fit', () => {
		const surface = new FakeAskAgentSurface();
		surface.fits = false;
		createAskAgent(surface)(request);
		expect(surface.href).toBe('/chats/new');
	});

	it('preserves selection context for the eventual send', () => {
		const surface = new FakeAskAgentSurface();
		const selection = { noteId: 'note-1', text: 'a promise', from: 0, to: 9 };
		createAskAgent(surface)({ ...request, selection } as ChatHandoff);
		expect(surface.staged?.selection).toEqual(selection);
	});
});
