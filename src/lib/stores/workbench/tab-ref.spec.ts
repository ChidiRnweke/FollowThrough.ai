import { describe, expect, it } from 'vitest';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import {
	chatKeyOf,
	chatTab,
	diagramIdOf,
	diagramTab,
	isChatTab,
	isDiagramTab,
	isNoteTab,
	isSearchTab,
	noteIdOf,
	noteTab,
	parseTabId,
	searchTab
} from './tab-ref';

const NOTE = '11111111-1111-4111-8111-111111111111' as NoteId;
const SESSION = '22222222-2222-4222-8222-222222222222';
const DIAGRAM = '33333333-3333-4333-8333-333333333333' as DiagramId;

describe('tab identity', () => {
	it('leaves a note tab as its bare uuid, so old URLs keep working', () => {
		expect(noteTab(NOTE)).toBe(NOTE);
	});

	it('prefixes a chat tab so it cannot collide with a note', () => {
		expect(chatTab(SESSION)).toBe(`chat:${SESSION}`);
	});

	it('reads a bare uuid as a note tab', () => {
		expect(parseTabId(NOTE)).toEqual({ kind: 'note', noteId: NOTE });
	});

	it('reads a prefixed id as a chat tab', () => {
		expect(parseTabId(chatTab(SESSION))).toEqual({ kind: 'chat', sessionKey: SESSION });
	});

	it('reads the bare literal as the search tab', () => {
		expect(parseTabId(searchTab())).toEqual({ kind: 'search' });
	});

	it('recognises the search tab', () => {
		expect(isSearchTab(searchTab())).toBe(true);
	});

	it('does not mistake a note tab for the search tab', () => {
		expect(isSearchTab(NOTE)).toBe(false);
	});

	it('gives no note for the search tab, so note consumers degrade instead of missing', () => {
		expect(noteIdOf(searchTab())).toBeUndefined();
	});

	it('rejects an id that is neither', () => {
		expect(parseTabId('not-a-tab')).toBeUndefined();
	});

	it('rejects a chat prefix wrapped around a non-uuid', () => {
		expect(parseTabId('chat:nonsense')).toBeUndefined();
	});

	it('tolerates surrounding whitespace from a hand-edited URL', () => {
		expect(parseTabId(`  ${NOTE}  `)).toEqual({ kind: 'note', noteId: NOTE });
	});

	it('recognises a chat tab', () => {
		expect(isChatTab(chatTab(SESSION))).toBe(true);
	});

	it('does not mistake a note tab for a chat', () => {
		expect(isChatTab(NOTE)).toBe(false);
	});

	it('recognises a note tab', () => {
		expect(isNoteTab(NOTE)).toBe(true);
	});

	it('gives the note behind a note tab', () => {
		expect(noteIdOf(NOTE)).toBe(NOTE);
	});

	it('gives no note for a chat tab, so note consumers degrade instead of missing', () => {
		expect(noteIdOf(chatTab(SESSION))).toBeUndefined();
	});

	it('gives no note for an absent tab', () => {
		expect(noteIdOf(undefined)).toBeUndefined();
	});

	it('gives the session behind a chat tab', () => {
		expect(chatKeyOf(chatTab(SESSION))).toBe(SESSION);
	});

	it('gives no session for a note tab', () => {
		expect(chatKeyOf(NOTE)).toBeUndefined();
	});
});

describe('diagram tab identity', () => {
	it('prefixes a diagram tab so it cannot collide with a note', () => {
		expect(diagramTab(DIAGRAM)).toBe(`diagram:${DIAGRAM}`);
	});

	it('reads a prefixed id as a diagram tab', () => {
		expect(parseTabId(diagramTab(DIAGRAM))).toEqual({ kind: 'diagram', diagramId: DIAGRAM });
	});

	it('recognises a diagram tab', () => {
		expect(isDiagramTab(diagramTab(DIAGRAM))).toBe(true);
	});

	it('reads the diagram behind a diagram tab', () => {
		expect(diagramIdOf(diagramTab(DIAGRAM))).toBe(DIAGRAM);
	});

	// The narrowing accessors are what let note-only consumers ignore a kind they
	// know nothing about instead of mistaking its id for a note's.
	it('reports no note behind a diagram tab', () => {
		expect(noteIdOf(diagramTab(DIAGRAM))).toBeUndefined();
	});

	it('drops a diagram tab whose id is not a uuid', () => {
		expect(parseTabId('diagram:nonsense')).toBeUndefined();
	});
});
