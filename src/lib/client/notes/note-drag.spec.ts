import { describe, expect, it } from 'vitest';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import {
	hasInternalNoteDrag,
	NOTE_DRAG_MIME,
	type NoteDragTransfer,
	readActiveNoteDrag,
	writeNoteDrag
} from './note-drag';

const noteId = '00000000-0000-4000-8000-000000000001' as NoteId;

class FakeDataTransfer implements NoteDragTransfer {
	effectAllowed = 'uninitialized';
	readonly values = new Map<string, string>();

	get types(): string[] {
		return [...this.values.keys()];
	}

	setData(type: string, value: string): void {
		this.values.set(type, value);
	}

	getData(type: string): string {
		return this.values.get(type) ?? '';
	}
}

const transfer = (): FakeDataTransfer => new FakeDataTransfer();
const entry = (kind: NoteSummary['kind'], archivedAt?: string): NoteSummary =>
	({ id: noteId, kind, archivedAt }) as NoteSummary;

describe('note drag contract', () => {
	it('writes the internal MIME payload', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(data.getData(NOTE_DRAG_MIME)).toBe(noteId);
	});

	it('uses copy semantics', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(data.effectAllowed).toBe('copy');
	});

	it('recognises only the internal MIME type', () => {
		const data = transfer();
		data.setData('text/plain', noteId);
		expect(hasInternalNoteDrag(data)).toBe(false);
	});

	it('accepts an active ordinary note', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(readActiveNoteDrag(data, [entry('note')])).toBe(noteId);
	});

	it('rejects a folder', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(readActiveNoteDrag(data, [entry('folder')])).toBeUndefined();
	});

	it('rejects a skill resource', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(readActiveNoteDrag(data, [entry('skill')])).toBeUndefined();
	});

	it('rejects an archived note', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(readActiveNoteDrag(data, [entry('note', '2026-07-21')])).toBeUndefined();
	});

	it('rejects an unknown note id', () => {
		const data = transfer();
		writeNoteDrag(data, noteId);
		expect(readActiveNoteDrag(data, [])).toBeUndefined();
	});
});
