import { describe, expect, it } from 'vitest';
import { memoryWrite, newMemory } from './index';
import {
	memoryEntryBuilder,
	testActor,
	testMemoryEntryId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('local memory writes', () => {
	it('creates profile memory with a stable identity and the product sharing default', () => {
		expect(
			newMemory(testMemoryEntryId(), testActor().userId, { content: '  Remember this  ' }, testNow)
		).toEqual({
			id: testMemoryEntryId(),
			userId: testActor().userId,
			projectId: undefined,
			content: 'Remember this',
			type: undefined,
			shareWithAgents: true,
			createdAt: testNow,
			updatedAt: testNow
		});
	});
	it('retains sharing and type when only the content changes', () => {
		const entry = memoryEntryBuilder({ shareWithAgents: false, type: 'constraint' });
		expect(memoryWrite(entry, { content: ' Updated ' }).local).toEqual({
			type: 'memory_entries',
			value: { ...entry, content: 'Updated' }
		});
	});
	it('clears an explicitly removed type without changing the content', () => {
		const entry = memoryEntryBuilder({ type: 'constraint' });
		expect(memoryWrite(entry, { type: null }).local).toEqual({
			type: 'memory_entries',
			value: { ...entry, type: undefined }
		});
	});
});
