import { describe, expect, it } from 'vitest';
import { memoryWrite, newMemory } from '$lib/testing/workspace/fixtures/commands';
import {
	memoryEntryBuilder,
	testActor,
	testMemoryEntryId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
describe('local memory writes', () => {
	it('creates profile memory with a stable identity and the chosen sharing value', async () => {
		expect(
			await newMemory(
				testMemoryEntryId(),
				testActor().userId,
				{ content: '  Remember this  ', shareWithAgents: true },
				testNow
			)
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
	it('retains sharing and type when only the content changes', async () => {
		const entry = memoryEntryBuilder({ shareWithAgents: false, type: 'constraint' });
		expect((await memoryWrite(entry, { content: ' Updated ' })).local).toEqual({
			type: 'memory_entries',
			value: { ...entry, content: 'Updated' }
		});
	});
	it('clears an explicitly removed type without changing the content', async () => {
		const entry = memoryEntryBuilder({ type: 'constraint' });
		expect((await memoryWrite(entry, { type: null })).local).toEqual({
			type: 'memory_entries',
			value: { ...entry, type: undefined }
		});
	});
});
