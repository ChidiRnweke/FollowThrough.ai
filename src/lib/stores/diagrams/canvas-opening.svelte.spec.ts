import { describe, expect, it } from 'vitest';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { canvasOpenings } from './canvas-opening.svelte';

let counter = 0;
/** A fresh session per test: the store is a singleton, as it is in the app. */
const session = (): ChatSessionKey => `session-${(counter += 1)}` as ChatSessionKey;

describe('Remembering which canvas subjects a conversation has seen', () => {
	it('opens for a subject the conversation has not shown yet', () => {
		expect(canvasOpenings.shouldOpen(session(), 'draft:one')).toBe(true);
	});

	// The half of the rule that had nowhere to live while this was component state:
	// the pane that closes the canvas is not the pane that opens it.
	it('stays closed for a subject that was dismissed', () => {
		const key = session();
		canvasOpenings.markShown(key, 'draft:one');
		expect(canvasOpenings.shouldOpen(key, 'draft:one')).toBe(false);
	});

	it('opens again when the agent revises the diagram', () => {
		const key = session();
		canvasOpenings.markShown(key, 'draft:one');
		expect(canvasOpenings.shouldOpen(key, 'draft:two')).toBe(true);
	});

	it('keeps conversations apart, so one dismissal is not every dismissal', () => {
		const dismissed = session();
		canvasOpenings.markShown(dismissed, 'draft:one');
		expect(canvasOpenings.shouldOpen(session(), 'draft:one')).toBe(true);
	});

	it('opens again for a conversation it has forgotten', () => {
		const key = session();
		canvasOpenings.markShown(key, 'draft:one');
		canvasOpenings.forget(key);
		expect(canvasOpenings.shouldOpen(key, 'draft:one')).toBe(true);
	});
});
