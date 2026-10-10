import type { WidgetId } from '$lib/models/widgets';
import { describe, expect, it } from 'vitest';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import {
	chatKeyOf,
	chatTab,
	diagramIdOf,
	diagramTab,
	widgetTab,
	widgetIdOf,
	isWidgetTab,
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
	it('preserves the bare note id and narrows its identity accessors', () => {
		expect({
			encoded: noteTab(NOTE),
			parsed: parseTabId(NOTE),
			isNote: isNoteTab(NOTE),
			isSearch: isSearchTab(NOTE),
			isChat: isChatTab(NOTE),
			noteId: noteIdOf(NOTE),
			chatKey: chatKeyOf(NOTE)
		}).toEqual({
			encoded: NOTE,
			parsed: { kind: 'note', noteId: NOTE },
			isNote: true,
			isSearch: false,
			isChat: false,
			noteId: NOTE,
			chatKey: undefined
		});
	});

	it('prefixes chat ids and exposes only chat identity', () => {
		const tab = chatTab(SESSION);
		expect({
			encoded: tab,
			parsed: parseTabId(tab),
			isChat: isChatTab(tab),
			noteId: noteIdOf(tab),
			chatKey: chatKeyOf(tab)
		}).toEqual({
			encoded: `chat:${SESSION}`,
			parsed: { kind: 'chat', sessionKey: SESSION },
			isChat: true,
			noteId: undefined,
			chatKey: SESSION
		});
	});

	it('recognises the search identity without exposing a note id', () => {
		const tab = searchTab();
		expect({ parsed: parseTabId(tab), isSearch: isSearchTab(tab), noteId: noteIdOf(tab) }).toEqual({
			parsed: { kind: 'search' },
			isSearch: true,
			noteId: undefined
		});
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

	it('gives no note for an absent tab', () => {
		expect(noteIdOf(undefined)).toBeUndefined();
	});
});

describe('diagram tab identity', () => {
	// The narrowing accessors are what let note-only consumers ignore a kind they
	// know nothing about instead of mistaking its id for a note's.
	it('prefixes diagram identity and narrows all accessors for that kind', () => {
		const tab = diagramTab(DIAGRAM);
		expect({
			encoded: tab,
			parsed: parseTabId(tab),
			isDiagram: isDiagramTab(tab),
			diagramId: diagramIdOf(tab),
			noteId: noteIdOf(tab)
		}).toEqual({
			encoded: `diagram:${DIAGRAM}`,
			parsed: { kind: 'diagram', diagramId: DIAGRAM },
			isDiagram: true,
			diagramId: DIAGRAM,
			noteId: undefined
		});
	});

	it('drops a diagram tab whose id is not a uuid', () => {
		expect(parseTabId('diagram:nonsense')).toBeUndefined();
	});
});

describe('widget tab identity', () => {
	const WIDGET = '77777777-7777-4777-8777-777777777777' as WidgetId;
	it('reads a prefixed id as a widget tab', () => {
		expect(parseTabId(widgetTab(WIDGET))).toEqual({ kind: 'widget', widgetId: WIDGET });
	});
	it('recognises a widget tab', () => {
		expect(isWidgetTab(widgetTab(WIDGET))).toBe(true);
	});
	it('reads the widget behind a widget tab', () => {
		expect(widgetIdOf(widgetTab(WIDGET))).toBe(WIDGET);
	});
	it('reports no note behind a widget tab', () => {
		expect(noteIdOf(widgetTab(WIDGET))).toBeUndefined();
	});
	it('drops a widget tab whose id is not a uuid', () => {
		expect(parseTabId('widget:nonsense')).toBeUndefined();
	});
});
