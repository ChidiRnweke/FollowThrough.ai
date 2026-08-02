import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChatComposer from './chat-composer.svelte';
import type { ContextChip } from '$lib/stores/agent/chat.svelte';
import type { NoteId } from '$lib/models/notes';

const skillChip: ContextChip = { kind: 'skill', id: '1' as NoteId, name: 'Note analyzer' };
const noteChip: ContextChip = { kind: 'note', id: '2' as NoteId, name: 'Reviewed draft' };

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
