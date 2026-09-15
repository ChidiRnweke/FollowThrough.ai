import { describe, expect, it } from 'vitest';
import { memoryChangePayloadSchema, storedMemoryChangePayloadSchema } from './index';
import { testProjectId, testMemoryEntryId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('memory proposal boundaries', () => {
	it.each([
		{ scope: 'project', operation: 'add', content: 'Fact' },
		{ scope: 'user', projectId: testProjectId(), operation: 'add', content: 'Fact' },
		{ scope: 'user', operation: 'update', content: 'Fact' },
		{ scope: 'user', operation: 'remove' },
		{ scope: 'user', operation: 'add' },
		{ scope: 'user', operation: 'add', content: '  ' },
		{ scope: 'user', operation: 'add', content: 'Fact', memoryEntryId: testMemoryEntryId() },
		{ scope: 'user', operation: 'remove', memoryEntryId: testMemoryEntryId(), content: 'Unused' }
	])('rejects incompatible request fields: %j', (input) => {
		expect(memoryChangePayloadSchema.safeParse(input).success).toBe(false);
	});
	it('normalizes an older project proposal without inventing a target', () => {
		expect(
			storedMemoryChangePayloadSchema.parse({
				operation: 'add',
				projectId: testProjectId(),
				content: 'Project fact'
			})
		).toEqual({
			scope: 'project',
			operation: 'add',
			projectId: testProjectId(),
			content: 'Project fact'
		});
	});
	it('normalizes an older profile proposal from its absent project', () => {
		expect(
			storedMemoryChangePayloadSchema.parse({
				operation: 'update',
				memoryEntryId: testMemoryEntryId(),
				content: 'Profile fact'
			})
		).toEqual({
			scope: 'user',
			operation: 'update',
			memoryEntryId: testMemoryEntryId(),
			content: 'Profile fact'
		});
	});
	it('keeps an older removal readable when it carried previously ignored content', () => {
		expect(
			storedMemoryChangePayloadSchema.parse({
				operation: 'remove',
				memoryEntryId: testMemoryEntryId(),
				content: 'Ignored',
				shareWithAgents: false
			})
		).toEqual({ scope: 'user', operation: 'remove', memoryEntryId: testMemoryEntryId() });
	});
	it('refuses a historical replacement without its required target', () => {
		expect(
			storedMemoryChangePayloadSchema.safeParse({ operation: 'update', content: 'Fact' }).success
		).toBe(false);
	});
	it('does not reinterpret a contradictory explicit scope as an older payload', () => {
		expect(
			storedMemoryChangePayloadSchema.safeParse({
				scope: 'user',
				projectId: testProjectId(),
				operation: 'add',
				content: 'Fact'
			}).success
		).toBe(false);
	});
});
