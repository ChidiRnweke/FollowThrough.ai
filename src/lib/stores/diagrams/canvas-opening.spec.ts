import { describe, expect, it } from 'vitest';
import { markCanvasShown, shouldOpenCanvas } from './canvas-opening';

describe('When the diagram canvas opens beside a chat', () => {
	// The studio is a chat until there is something to show.
	it('stays closed while the conversation has drafted nothing', () => {
		expect(shouldOpenCanvas({}, undefined)).toBe(false);
	});

	it('opens when the agent presents a diagram', () => {
		expect(shouldOpenCanvas({}, 'flowchart LR\nA --> B')).toBe(true);
	});

	// The reason this is a rule rather than a reflex: a re-render of the same draft
	// must not reopen a canvas the user deliberately closed.
	it('stays closed for a draft it has already shown', () => {
		expect(
			shouldOpenCanvas(markCanvasShown('flowchart LR\nA --> B'), 'flowchart LR\nA --> B')
		).toBe(false);
	});

	it('opens again when the agent revises the diagram', () => {
		expect(shouldOpenCanvas(markCanvasShown('first version'), 'second version')).toBe(true);
	});

	it('forgets the shown draft when there is none', () => {
		expect(markCanvasShown(undefined)).toEqual({});
	});
});
