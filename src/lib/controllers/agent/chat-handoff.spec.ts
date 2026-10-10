import type { NoteId } from '$lib/models/notes';
import { describe, expect, it } from 'vitest';
import { type ChatHandoff } from '$lib/models/chat';
import { ChatHandoffs, type AskAgentDependencies } from '$lib/controllers/agent/chat-handoff';

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
		new ChatHandoffs(surface).ask(request);
		expect({ opened: surface.opened, staged: surface.staged }).toEqual({
			opened: true,
			staged: request
		});
	});

	it('carries the prompt when chat needs a full-page navigation', () => {
		const surface = new FakeAskAgentSurface();
		surface.fits = false;
		new ChatHandoffs(surface).ask(request);
		expect({ carried: surface.carried, href: surface.href }).toEqual({
			carried: request,
			href: '/chats/new'
		});
	});

	it('preserves selection context for the eventual send', () => {
		const surface = new FakeAskAgentSurface();
		const selection = {
			noteId: 'note-1' as NoteId,
			revision: 0,
			text: 'a promise',
			from: 0,
			to: 9
		};
		new ChatHandoffs(surface).ask({ ...request, selection });
		expect(surface.staged?.selection).toEqual(selection);
	});
});
