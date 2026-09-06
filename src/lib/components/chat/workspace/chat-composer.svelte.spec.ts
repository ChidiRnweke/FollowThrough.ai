import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChatComposer from './chat-composer.svelte';
import type { ContextChip, SelectionChip } from '$lib/stores/agent/chat.svelte';
import type { AgentModel } from '$lib/models/agent';
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

const sonnet: AgentModel = {
	id: 'anthropic/claude-sonnet-4.5',
	name: 'Anthropic: Claude Sonnet 4.5',
	provider: 'anthropic',
	supportsTools: true,
	supportsVision: true,
	recommended: true,
	capabilities: ['tools']
};

const flash: AgentModel = {
	id: 'deepseek/deepseek-v4-flash',
	name: 'DeepSeek: V4 Flash',
	provider: 'deepseek',
	supportsTools: true,
	supportsVision: false,
	recommended: true,
	capabilities: ['tools']
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
	models: [sonnet, flash],
	modelOverride: null,
	defaultModelId: flash.id,
	visionModelOverride: null,
	defaultVisionModelId: sonnet.id,
	onmodelchange: () => undefined,
	onvisionmodelchange: () => undefined,
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

/**
 * The bar exists to answer one question the app could not answer before: which
 * model is this chat on. Naming a model is only half of it — a reader also has to
 * be able to tell their own choice from the workspace's.
 */
describe('ChatComposer model', () => {
	it('names the model this chat chose', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: sonnet.id });
		await expect
			.element(screen.getByLabelText('Model for this chat: Claude Sonnet 4.5'))
			.toBeInTheDocument();
	});

	it('names the workspace default when the chat chose none', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: null });
		await expect
			.element(screen.getByLabelText('Model for this chat: V4 Flash'))
			.toBeInTheDocument();
	});

	it('marks an inherited model as the default rather than passing it off as a choice', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: null });
		await expect.element(screen.getByText('· default')).toBeInTheDocument();
	});

	it('leaves the default marking off a model the chat chose for itself', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: sonnet.id });
		await expect.element(screen.getByText('· default')).not.toBeInTheDocument();
	});

	/**
	 * Two DeepSeek models used to render as the same truncated string, because the
	 * row repeated the vendor the metadata line was already going to carry.
	 */
	it('names a picker row without repeating the vendor into the title', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: null });
		await screen.getByLabelText('Model for this chat: V4 Flash').click();
		await expect.element(screen.getByRole('option', { name: /^V4 Flash/ })).toBeInTheDocument();
	});

	it('says why a chat model that cannot see images needs a describer', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: flash.id });
		await screen.getByLabelText('Model for this chat: V4 Flash').click();
		await expect
			.element(
				screen.getByLabelText('V4 Flash cannot see images. This model describes them for it.')
			)
			.toBeInTheDocument();
	});

	/**
	 * The server ignores a describer when the chat model reads images itself, so
	 * offering the list would be offering a setting that changes nothing.
	 */
	it('closes the vision tab when the chat model reads images itself', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: sonnet.id });
		await screen.getByLabelText('Model for this chat: Claude Sonnet 4.5').click();
		expect(await screen.getByRole('tab', { name: 'Vision model' }).element()).toHaveProperty(
			'disabled',
			true
		);
	});

	it('says why the vision tab is closed rather than leaving it inert', async () => {
		const screen = await render(ChatComposer, { ...base, modelOverride: sonnet.id });
		await screen.getByLabelText('Model for this chat: Claude Sonnet 4.5').click();
		await expect
			.element(screen.getByLabelText('Claude Sonnet 4.5 supports both text and image inputs.'))
			.toBeInTheDocument();
	});

	/**
	 * The vision model used to be a picker nested inside this popover. It is the same
	 * list doing the same job, so it is the same list on a tab of its own.
	 */
	it('reports a chosen vision model through onvisionmodelchange', async () => {
		const chosen: (string | null)[] = [];
		const screen = await render(ChatComposer, {
			...base,
			modelOverride: flash.id,
			onvisionmodelchange: (value) => chosen.push(value)
		});
		await screen.getByLabelText('Model for this chat: V4 Flash').click();
		await screen.getByRole('tab', { name: 'Vision model' }).click();
		// By the row's full name: the workspace-default row names this same model as
		// its subtitle, so a loose match hits both.
		await screen.getByRole('option', { name: 'Claude Sonnet 4.5 anthropic' }).click();
		expect(chosen).toEqual([sonnet.id]);
	});

	/**
	 * `OPENROUTER_RECOMMENDED_MODELS` is unset on a fresh deployment, which used to
	 * open the popover onto a "Recommended" heading with nothing under it.
	 */
	it('invites a search when nothing is recommended', async () => {
		const screen = await render(ChatComposer, {
			...base,
			models: [
				{ ...flash, recommended: false },
				{ ...sonnet, recommended: false }
			]
		});
		await screen.getByLabelText('Model for this chat: V4 Flash').click();
		await expect.element(screen.getByText('No recommended models')).toBeInTheDocument();
	});

	it('reports a chosen model through onmodelchange', async () => {
		const chosen: (string | null)[] = [];
		const screen = await render(ChatComposer, {
			...base,
			modelOverride: null,
			onmodelchange: (value) => chosen.push(value)
		});
		await screen.getByLabelText('Model for this chat: V4 Flash').click();
		await screen.getByRole('option', { name: /Claude Sonnet 4.5/ }).click();
		expect(chosen).toEqual([sonnet.id]);
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
