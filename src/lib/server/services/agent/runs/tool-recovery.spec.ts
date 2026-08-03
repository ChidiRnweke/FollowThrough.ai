import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	createUseToolAttempts,
	invalidUseToolPayload,
	resolveUseToolPayload,
	unknownUseToolName,
	useToolEnvelopeSchema
} from './tool-recovery';

const noteSchema = z.object({ noteId: z.string(), markdown: z.string() });
const failureFor = (payload: unknown, attempt?: number) =>
	invalidUseToolPayload(
		'save_note',
		noteSchema.safeParse(payload).error as z.ZodError,
		z.toJSONSchema(noteSchema),
		attempt
	);

describe('tool recovery', () => {
	it('offers a recovery path for an unknown tool', () => {
		expect(unknownUseToolName('missing', [])).toHaveProperty('recovery');
	});

	it('reads the arguments a model placed under payload', () => {
		const envelope = useToolEnvelopeSchema.parse({ name: 'save_note', payload: { noteId: 'n1' } });
		expect(resolveUseToolPayload(envelope)).toEqual({ ok: true, payload: { noteId: 'n1' } });
	});

	it('reads the arguments a model sent as a flat JSON string', () => {
		const envelope = useToolEnvelopeSchema.parse({
			name: 'save_note',
			arguments: '{"noteId":"n1"}'
		});
		expect(resolveUseToolPayload(envelope)).toEqual({ ok: true, payload: { noteId: 'n1' } });
	});

	it('rejects an arguments string that is not JSON', () => {
		const envelope = useToolEnvelopeSchema.parse({ name: 'save_note', arguments: 'noteId=n1' });
		expect(resolveUseToolPayload(envelope)).toEqual({ ok: false });
	});

	it('reports an envelope carrying neither payload nor arguments as unresolved', () => {
		const envelope = useToolEnvelopeSchema.parse({ name: 'save_note' });
		expect(resolveUseToolPayload(envelope)).toEqual({ ok: false });
	});

	it('names the required fields on the first invalid payload', () => {
		expect(failureFor({}).recovery).toContain('noteId, markdown');
	});

	it('offers a literal example on the second identical attempt', () => {
		expect(failureFor({}, 2).recovery).toContain('"noteId":"<noteId>"');
	});

	it('stops offering use_tool after a third identical attempt', () => {
		expect(failureFor({}, 3).recovery).toContain('Stop calling use_tool');
	});

	it('counts an identical payload as a repeat attempt', () => {
		const attempts = createUseToolAttempts();
		attempts.record('save_note', {});
		expect(attempts.record('save_note', {})).toBe(2);
	});

	it('counts a payload written with reordered keys as the same attempt', () => {
		const attempts = createUseToolAttempts();
		attempts.record('save_note', { noteId: 'n1', markdown: '#' });
		expect(attempts.record('save_note', { markdown: '#', noteId: 'n1' })).toBe(2);
	});

	it('treats a corrected payload as a fresh attempt', () => {
		const attempts = createUseToolAttempts();
		attempts.record('save_note', {});
		expect(attempts.record('save_note', { noteId: 'n1' })).toBe(1);
	});
});
