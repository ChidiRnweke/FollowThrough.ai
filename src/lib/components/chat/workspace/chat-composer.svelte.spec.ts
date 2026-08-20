import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChatComposer from './chat-composer.svelte';
import type { ContextChip, SelectionChip } from '$lib/stores/agent/chat.svelte';
import type { NoteId } from '$lib/models/notes';

const skillChip: ContextChip = { kind: 'skill', id: '1' as NoteId, name: 'Note analyzer' };
const noteChip: ContextChip = { kind: 'note', id: '2' as NoteId, name: 'Reviewed draft' };
const folderChip: ContextChip = {
	kind: 'folder',
	id: '3' as NoteId,
	name: 'Research',
	noteCount: 4
};

const selectionChip: SelectionChip = {
	kind: 'selection',
	id: '4:12-41',
	name: 'Q3 planning',
	wordCount: 6,
	selection: {
		noteId: '4' as NoteId,
		revision: 2,
		from: 12,
		to: 41,
		text: 'We ship the export flow first.'
	}
};

const base = {
	chips: [],
	mentionCandidates: [],
	highlighted: 0,
	selectedImages: [],
	agentAvailable: true,
	isStreaming: false,
	connection: 'connected',
	executionMode: 'approval_required',
	onremovechip: () => undefined,
	onpinselection: () => undefined,
	onpick: () => undefined,
	onhighlight: () => undefined,
	onremoveimage: () => undefined,
	onfiles: () => undefined,
	onkeydown: () => undefined,
	oninput: () => undefined,
	onpaste: () => undefined,
	ontoggleexecutionmode: () => undefined,
	onsend: () => undefined,
	onstop: () => undefined
} as const;

describe('ChatComposer mentions', () => {
	it('lists mention candidates and picks one', async () => {
		const picked: string[] = [];
		const screen = await render(ChatComposer, {
			...base,
			mentionCandidates: [noteChip],
			onpick: (chip) => picked.push(`${chip.kind}:${chip.name}`)
		});
		await screen.getByRole('option', { name: /Reviewed draft/ }).click();
		expect(picked).toEqual(['note:Reviewed draft']);
	});

	it('offers folders as mention candidates', async () => {
		const picked: string[] = [];
		const screen = await render(ChatComposer, {
			...base,
			mentionCandidates: [folderChip],
			onpick: (chip) => picked.push(`${chip.kind}:${chip.name}`)
		});
		await screen.getByRole('option', { name: /Research/ }).click();
		expect(picked).toEqual(['folder:Research']);
	});
});

describe('ChatComposer context chips', () => {
	it('removes a context chip through onremovechip', async () => {
		const removed: string[] = [];
		const screen = await render(ChatComposer, {
			...base,
			chips: [skillChip],
			onremovechip: (chip) => removed.push(`${chip.kind}:${chip.name}`)
		});
		await screen.getByRole('button', { name: 'Remove Note analyzer from context' }).click();
		expect(removed).toEqual(['skill:Note analyzer']);
	});

	it('shows how many notes a folder chip stands for', async () => {
		const screen = await render(ChatComposer, { ...base, chips: [folderChip] });
		await expect.element(screen.getByText('4 notes')).toBeInTheDocument();
	});

	it('says how much of the note a pinned passage brought along', async () => {
		const screen = await render(ChatComposer, { ...base, chips: [selectionChip] });
		await expect.element(screen.getByText('6 words')).toBeInTheDocument();
	});
});

describe('ChatComposer live selection', () => {
	/**
	 * The highlight is not the note and is about to be some other part of it, so the chip
	 * says what it is rather than borrowing the note's title.
	 */
	it('labels the highlighted passage as the current selection', async () => {
		const screen = await render(ChatComposer, { ...base, liveSelection: selectionChip });
		await expect.element(screen.getByText('Current selection')).toBeInTheDocument();
	});

	it('reports its dismissal as automatic, so the panel remembers rather than unpins', async () => {
		const dismissed: string[] = [];
		const screen = await render(ChatComposer, {
			...base,
			liveSelection: selectionChip,
			onremovechip: (chip, automatic) => dismissed.push(`${chip.id}:${automatic}`)
		});
		// By label, not by role: the hover-card trigger wrapping the badge is itself a button
		// whose accessible name swallows the dismiss button's.
		await screen.getByLabelText('Remove the current selection from context').click();
		expect(dismissed).toEqual(['4:12-41:true']);
	});

	it('pins the highlighted passage through the pin the chip shows', async () => {
		const pinned: string[] = [];
		const screen = await render(ChatComposer, {
			...base,
			liveSelection: selectionChip,
			onpinselection: (chip) => pinned.push(chip.id)
		});
		await screen.getByLabelText('Pin this passage to the message').click();
		expect(pinned).toEqual(['4:12-41']);
	});

	it('offers no pin on a passage already pinned', async () => {
		const screen = await render(ChatComposer, { ...base, chips: [selectionChip] });
		await expect
			.element(screen.getByLabelText('Pin this passage to the message'))
			.not.toBeInTheDocument();
	});

	it('keeps a pinned passage distinguishable from the highlighted one', async () => {
		const screen = await render(ChatComposer, {
			...base,
			liveSelection: selectionChip,
			chips: [{ ...selectionChip, id: '4:60-80' }]
		});
		await expect
			.element(screen.getByLabelText('Remove the passage pinned from Q3 planning from context'))
			.toBeInTheDocument();
	});
});

describe('ChatComposer execution mode', () => {
	it('toggles the execution mode', async () => {
		let toggles = 0;
		const screen = await render(ChatComposer, {
			...base,
			executionMode: 'approval_required',
			ontoggleexecutionmode: () => {
				toggles += 1;
			}
		});
		await screen.getByRole('button', { name: 'Approval' }).click();
		expect(toggles).toBe(1);
	});
});

describe('ChatComposer send affordance', () => {
	it('disables send with an empty prompt', async () => {
		const screen = await render(ChatComposer, { ...base, prompt: '' });
		expect(await screen.getByRole('button', { name: 'Send message' }).element()).toHaveProperty(
			'disabled',
			true
		);
	});
});
