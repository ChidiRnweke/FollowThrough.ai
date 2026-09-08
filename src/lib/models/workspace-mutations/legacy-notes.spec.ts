import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { noteEtag } from '$lib/models/notes';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	resolveImportedNoteBase,
	legacyNoteImport,
	legacyNoteSyncRecordSchema,
	type LegacyNoteSyncRecord
} from './index';
const pending = (): LegacyNoteSyncRecord => {
	const base = noteBuilder();
	return {
		userId: base.userId,
		noteId: base.id,
		base: { note: base, etag: noteEtag(base) },
		local: { ...base, plainText: 'Offline edit' },
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: base.updatedAt
	};
};
describe('legacy note draft conversion', () => {
	it('does not import a clean cached note as a mutation', () => {
		const record = pending();
		expect(legacyNoteImport({ ...record, state: 'synced', local: record.base.note })).toBeNull();
	});
	it('does not overwrite metadata that the offline edit did not change', () => {
		const record = pending();
		expect(legacyNoteImport(record)?.draft.command).toEqual({
			kind: 'saveNote',
			noteId: record.noteId,
			document: record.local.document,
			plainText: 'Offline edit'
		});
	});
	it('retains explicitly edited metadata including cleared numbering', () => {
		const record = pending();
		const base = { ...record.base.note, sectionNumbering: true };
		expect(
			legacyNoteImport({
				...record,
				base: { note: base, etag: noteEtag(base) },
				local: { ...record.local, title: 'New title', isPinned: true }
			})?.draft.command
		).toEqual({
			kind: 'saveNote',
			noteId: record.noteId,
			document: record.local.document,
			plainText: 'Offline edit',
			title: 'New title',
			isPinned: true,
			sectionNumbering: null
		});
	});
	it('rejects a draft with another account inside its base', () => {
		const record = pending();
		const base = { ...record.base.note, userId: testActor(2).userId };
		expect(
			legacyNoteSyncRecordSchema.safeParse({
				...record,
				base: { note: base, etag: noteEtag(base) }
			}).success
		).toBe(false);
	});
	it('requires the retained remote copy for a legacy conflict', () => {
		expect(legacyNoteSyncRecordSchema.safeParse({ ...pending(), state: 'conflict' }).success).toBe(
			false
		);
	});
});

describe('imported note base validation', () => {
	it('recognizes an interrupted save that already reached the server', () => {
		const record = pending();
		const snapshot = {
			etag: syncEtag(8n),
			value: { type: 'notes' as const, value: { ...record.local, currentRevision: 2 } }
		};
		expect(
			resolveImportedNoteBase(
				{ type: 'notes', value: record.base.note },
				{ type: 'notes', value: record.local },
				{ kind: 'found', snapshot }
			)
		).toEqual({ kind: 'matched', snapshot });
	});
	it('preserves concurrent numbering changes as a conflict', () => {
		const record = pending();
		const remote = {
			kind: 'found' as const,
			snapshot: {
				etag: syncEtag(8n),
				value: { type: 'notes' as const, value: { ...record.base.note, sectionNumbering: true } }
			}
		};
		expect(
			resolveImportedNoteBase(
				{ type: 'notes', value: record.base.note },
				{ type: 'notes', value: record.local },
				remote
			)
		).toEqual({ kind: 'conflict', remote });
	});
	it('preserves an offline edit when the server deleted its note', () => {
		const record = pending();
		const remote = { kind: 'deleted' as const, etag: syncEtag(8n) };
		expect(
			resolveImportedNoteBase(
				{ type: 'notes', value: record.base.note },
				{ type: 'notes', value: record.local },
				remote
			)
		).toEqual({ kind: 'conflict', remote });
	});
});
