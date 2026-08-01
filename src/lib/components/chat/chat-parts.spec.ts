import { describe, expect, it } from 'vitest';
import type { ChatPart } from '$lib/stores/agent/chat.svelte';
import type { ChatToolActivity, ChatToolStatus } from '$lib/stores/agent/chat-tools';
import { groupChatParts } from './chat-parts';

const toolPart = (callId: string, status: ChatToolStatus): ChatPart => ({
	kind: 'tool',
	tool: { callId, name: 'create_todo', arguments: {}, status } as ChatToolActivity
});

const text = (value: string): ChatPart => ({ kind: 'text', text: value });

describe('Parallel approvals are reviewed as one bundle', () => {
	it('bundles calls that parked side by side', () => {
		const groups = groupChatParts([
			toolPart('a', 'approval_required'),
			toolPart('b', 'approval_required')
		]);
		expect(groups).toEqual([
			{ kind: 'approvals', tools: [expect.objectContaining({ callId: 'a' }), expect.anything()] }
		]);
	});

	it('leaves a lone approval as a bundle of one, so the common case is unchanged', () => {
		const groups = groupChatParts([toolPart('a', 'approval_required')]);
		expect(groups).toEqual([
			{ kind: 'approvals', tools: [expect.objectContaining({ callId: 'a' })] }
		]);
	});

	it('keeps approvals apart when the model spoke between them', () => {
		const groups = groupChatParts([
			toolPart('a', 'approval_required'),
			text('Next I will file it.'),
			toolPart('b', 'approval_required')
		]);
		expect(groups.map((group) => group.kind)).toEqual(['approvals', 'part', 'approvals']);
	});

	it('leaves a call that already ran out of the bundle', () => {
		const groups = groupChatParts([toolPart('a', 'succeeded'), toolPart('b', 'approval_required')]);
		expect(groups.map((group) => group.kind)).toEqual(['part', 'approvals']);
	});

	it('passes prose and reasoning through untouched', () => {
		const parts = [text('Hello'), { kind: 'reasoning', text: 'Thinking' } as ChatPart];
		expect(groupChatParts(parts)).toEqual([
			{ kind: 'part', part: parts[0] },
			{ kind: 'part', part: parts[1] }
		]);
	});
});
