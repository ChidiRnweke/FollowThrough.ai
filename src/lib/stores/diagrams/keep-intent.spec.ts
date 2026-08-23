import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import type { DiagramId } from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';
import { keepIntent, keepLabel, type KeepContext } from './keep-intent';

const TARGET = '323d2437-34a6-4e6e-a82d-f495ce30852b' as DiagramId;
const PROJECT = '40a540a8-4823-4557-9acd-0a41db809816' as ProjectId;
const CONVERSATION = '8dd82576-fc42-4f67-872a-b0f39976b207' as ConversationId;

const context = (overrides: Partial<KeepContext> = {}): KeepContext => ({
	targetMissing: false,
	projectId: PROJECT,
	conversationId: CONVERSATION,
	...overrides
});

describe('What the canvas’s button will do', () => {
	it('replaces the diagram a revision was drawn against', () => {
		expect(keepIntent(context({ target: TARGET }))).toEqual({
			kind: 'replace',
			diagramId: TARGET
		});
	});

	// The failure this exists for: deleting the diagram elsewhere used to make the
	// canvas unsavable, throwing away work that was perfectly good.
	it('keeps the work as a new diagram when the target has been deleted', () => {
		expect(keepIntent(context({ target: TARGET, targetMissing: true })).kind).toBe('create');
	});

	it('creates when there was never a target', () => {
		expect(keepIntent(context()).kind).toBe('create');
	});

	it('carries the project the new diagram belongs to', () => {
		expect(keepIntent(context())).toMatchObject({ projectId: PROJECT });
	});

	it('carries the conversation the new diagram is kept beside', () => {
		expect(keepIntent(context())).toMatchObject({ conversationId: CONVERSATION });
	});

	it('blocks with a reason when the chat belongs to no project', () => {
		expect(keepIntent(context({ projectId: undefined })).kind).toBe('blocked');
	});

	it('says what to do about a chat that belongs to no project', () => {
		expect(keepIntent(context({ projectId: undefined }))).toMatchObject({
			reason: expect.stringContaining('project')
		});
	});

	it('blocks before a conversation exists to keep the diagram beside', () => {
		expect(keepIntent(context({ conversationId: undefined })).kind).toBe('blocked');
	});

	// A missing target must not resurrect a replace through the create branch.
	it('does not replace a deleted target even with everything else in place', () => {
		expect(keepIntent(context({ target: TARGET, targetMissing: true })).kind).not.toBe('replace');
	});
});

describe('The button’s words', () => {
	it('promises a replacement only when one will happen', () => {
		expect(keepLabel({ kind: 'replace', diagramId: TARGET })).toBe('Replace diagram');
	});

	it('says keep when the work becomes a new diagram', () => {
		expect(keepLabel({ kind: 'create', projectId: PROJECT, conversationId: CONVERSATION })).toBe(
			'Keep diagram'
		);
	});

	it('says keep when the action is blocked, since nothing is replaced', () => {
		expect(keepLabel({ kind: 'blocked', reason: 'why' })).toBe('Keep diagram');
	});
});
