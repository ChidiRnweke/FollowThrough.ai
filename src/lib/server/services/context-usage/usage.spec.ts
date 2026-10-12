import { describe, expect, it } from 'vitest';
import type { ContextTouch, EmptySearch, ToolContextLog } from '$lib/models/context-usage';
import type { DateTime } from '$lib/models/workspace';
import type { ToolContextLogRepository } from '$lib/server/repositories/context-usage';
import { attachmentViewBuilder, testAttachmentId } from '$lib/testing/attachments/fixtures/views';
import {
	memoryEntryBuilder,
	noteBuilder,
	testConversationId,
	testMemoryEntryId,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { ProjectContextUsageService, type ProjectHoldings } from './usage';

const PROJECT = testProjectId(1);
const OTHER_PROJECT = testProjectId(2);
const CHAT = testConversationId(1);
const OTHER_CHAT = testConversationId(2);
const at = (minute: number) =>
	`2026-10-01T09:${String(minute).padStart(2, '0')}:00.000Z` as DateTime;

const brief = noteBuilder({ id: testNoteId(1), projectId: PROJECT, title: 'Brief' });
const plan = noteBuilder({ id: testNoteId(2), projectId: PROJECT, title: 'Plan' });
const contract = attachmentViewBuilder({
	attachment: { id: testAttachmentId(1), projectId: PROJECT, path: 'files/MSA-2026.pdf' }
});
const fact = memoryEntryBuilder({
	id: testMemoryEntryId(1),
	projectId: PROJECT,
	content: 'Launch is in March'
});

const holdings = (over: Partial<ProjectHoldings> = {}): ProjectHoldings => ({
	notes: [brief, plan],
	attachments: [contract],
	memory: [fact],
	...over
});

const touch = (
	kind: 'note' | 'attachment' | 'memory',
	id: string,
	minute: number,
	over: { projectId?: typeof PROJECT; conversationId?: typeof CHAT } = {}
): ContextTouch => ({
	kind,
	id,
	projectId: over.projectId ?? PROJECT,
	conversationId: over.conversationId ?? CHAT,
	at: at(minute),
	call: minute
});

const summarise = (log: Partial<ToolContextLog>, over: Partial<ProjectHoldings> = {}) => {
	const repository: ToolContextLogRepository = {
		read: async () => ({
			touches: [],
			emptySearches: [],
			conversations: [{ id: CHAT, title: 'Liability questions', projectId: PROJECT }],
			unreadableCalls: 0,
			...log
		})
	};
	// A Wednesday, three weeks after the first fixture touch.
	const now = () => '2026-10-22T12:00:00.000Z' as DateTime;
	return new ProjectContextUsageService(repository, now).summarise(PROJECT, holdings(over));
};

describe('Most-used context', () => {
	it('ranks items by how many calls drew on them, then by how recently', async () => {
		const result = await summarise({
			touches: [
				touch('attachment', contract.attachment.id, 1),
				touch('note', brief.id, 2),
				touch('attachment', contract.attachment.id, 3),
				touch('memory', fact.id, 4)
			]
		});
		expect(result.mostUsed.map((row) => [row.item.title, row.uses, row.lastUsedAt])).toEqual([
			['MSA-2026.pdf', 2, at(3)],
			['Launch is in March', 1, at(4)],
			['Brief', 1, at(2)]
		]);
	});

	it('counts a hit only for the project the hit came from, whatever chat it was in', async () => {
		const result = await summarise({
			touches: [
				touch('note', brief.id, 1, { conversationId: OTHER_CHAT }),
				touch('note', brief.id, 2, { projectId: OTHER_PROJECT })
			]
		});
		expect(result.mostUsed.map((row) => row.uses)).toEqual([1]);
	});

	it('leaves out content the project no longer holds', async () => {
		const result = await summarise({ touches: [touch('note', testNoteId(99), 1)] });
		expect(result.mostUsed).toEqual([]);
	});

	it('counts a skill in the project its chat was opened from', async () => {
		const skill: ContextTouch = {
			kind: 'skill',
			id: testNoteId(50),
			title: 'Contract review',
			conversationId: CHAT,
			at: at(1),
			call: 1
		};
		const elsewhere: ContextTouch = { ...skill, conversationId: OTHER_CHAT, at: at(2), call: 2 };
		const result = await summarise({
			touches: [skill, elsewhere],
			conversations: [
				{ id: CHAT, projectId: PROJECT },
				{ id: OTHER_CHAT, projectId: OTHER_PROJECT }
			]
		});
		expect(result.mostUsed.map((row) => [row.item.kind, row.item.title, row.uses])).toEqual([
			['skill', 'Contract review', 1]
		]);
	});
});

describe('Never-used context', () => {
	it('lists what the project holds that no call drew on', async () => {
		const result = await summarise({ touches: [touch('note', brief.id, 1)] });
		expect(result.neverUsed.map((item) => item.title)).toEqual([
			'Plan',
			'MSA-2026.pdf',
			'Launch is in March'
		]);
	});

	it('leaves out folders, archived notes and files search cannot read', async () => {
		const result = await summarise(
			{},
			{
				notes: [
					noteBuilder({ id: testNoteId(3), projectId: PROJECT, kind: 'folder', title: 'Folder' }),
					noteBuilder({ id: testNoteId(4), projectId: PROJECT, title: 'Old', archivedAt: at(0) })
				],
				attachments: [
					attachmentViewBuilder({
						attachment: { id: testAttachmentId(2), projectId: PROJECT, path: 'scan.png' },
						version: { processingStatus: 'failed', processingFailure: 'No text found' }
					})
				],
				memory: []
			}
		);
		expect(result.neverUsed).toEqual([]);
	});
});

describe('Files the agent cannot see', () => {
	it('reports each attachment whose text was not extracted in full, with why', async () => {
		const result = await summarise(
			{},
			{
				attachments: [
					contract,
					attachmentViewBuilder({
						attachment: { id: testAttachmentId(2), projectId: PROJECT, path: 'scan.png' },
						version: { processingStatus: 'failed', processingFailure: 'No text found' }
					}),
					attachmentViewBuilder({
						attachment: { id: testAttachmentId(3), projectId: PROJECT, path: 'deck.pptx' },
						version: { processingStatus: 'queued' }
					})
				]
			}
		);
		expect(result.hiddenAttachments).toEqual([
			{ id: testAttachmentId(2), title: 'scan.png', status: 'failed', failure: 'No text found' },
			{ id: testAttachmentId(3), title: 'deck.pptx', status: 'queued' }
		]);
	});
});

describe('Chats and searches', () => {
	it('lists each chat with the distinct items it drew on, most recent first', async () => {
		const result = await summarise({
			touches: [
				touch('note', brief.id, 1, { conversationId: OTHER_CHAT }),
				touch('note', brief.id, 2),
				touch('attachment', contract.attachment.id, 3),
				touch('note', brief.id, 4)
			],
			conversations: [
				{ id: CHAT, title: 'Liability questions', projectId: PROJECT },
				{ id: OTHER_CHAT }
			]
		});
		expect(
			result.chats.map((chat) => [chat.title, chat.lastUsedAt, chat.items.map((i) => i.title)])
		).toEqual([
			['Liability questions', at(4), ['Brief', 'MSA-2026.pdf']],
			[undefined, at(1), ['Brief']]
		]);
	});

	it('keeps searches that found nothing here, scoped here or asked from a chat about it', async () => {
		const search = (query: string, minute: number, over: Partial<EmptySearch> = {}) => ({
			query,
			conversationId: CHAT,
			at: at(minute),
			...over
		});
		const result = await summarise({
			emptySearches: [
				search('termination clause', 1, { projectId: PROJECT }),
				search('pricing tiers', 2),
				search('roadmap', 3, { projectId: OTHER_PROJECT }),
				search('hiring plan', 4, { conversationId: OTHER_CHAT })
			],
			conversations: [{ id: CHAT, projectId: PROJECT }, { id: OTHER_CHAT }]
		});
		expect(result.missedSearches.map((s) => s.query)).toEqual([
			'pricing tiers',
			'termination clause'
		]);
	});

	it('folds repeats of one query into one row, most-repeated first', async () => {
		const search = (query: string, minute: number, conversationId = CHAT) => ({
			query,
			projectId: PROJECT,
			conversationId,
			at: at(minute)
		});
		const result = await summarise({
			emptySearches: [
				search('launch brief', 1),
				search('SEO checklist', 2),
				search('Launch  Brief', 3, OTHER_CHAT)
			]
		});
		expect(result.missedSearches).toEqual([
			{ query: 'Launch  Brief', times: 2, lastAt: at(3), conversationId: OTHER_CHAT },
			{ query: 'SEO checklist', times: 1, lastAt: at(2), conversationId: CHAT }
		]);
	});

	it('counts lookups per week by kind, from the first lookup to this week', async () => {
		const day = (date: string) => `${date}T10:00:00.000Z` as DateTime;
		const result = await summarise({
			touches: [
				// 2026-10-01 is a Thursday, in the week of Monday 2026-09-28.
				{ ...touch('note', brief.id, 0), at: day('2026-10-01') },
				{ ...touch('attachment', contract.attachment.id, 0), at: day('2026-10-02') },
				// The week of 2026-10-05 has no lookups; the week of 2026-10-12 has one.
				{ ...touch('note', brief.id, 0), at: day('2026-10-12') }
			]
		});
		expect(
			result.activity.map((week) => [week.weekStart.slice(0, 10), week.note, week.attachment])
		).toEqual([
			['2026-09-28', 1, 1],
			['2026-10-05', 0, 0],
			['2026-10-12', 1, 0],
			['2026-10-19', 0, 0]
		]);
	});

	it('has no weeks before the agent ever looked anything up', async () => {
		const result = await summarise({});
		expect(result.activity).toEqual([]);
	});

	it('states how much of each kind of content has been looked up', async () => {
		const result = await summarise({ touches: [touch('note', brief.id, 1)] });
		expect(result.coverage).toEqual([
			{ kind: 'note', used: 1, total: 2 },
			{ kind: 'attachment', used: 0, total: 1 },
			{ kind: 'memory', used: 0, total: 1 }
		]);
	});

	it('passes on how many journalled calls could not be read', async () => {
		const result = await summarise({ unreadableCalls: 3 });
		expect(result.unreadableCalls).toBe(3);
	});
});
