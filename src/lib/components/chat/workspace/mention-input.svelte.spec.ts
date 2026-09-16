import { expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ChatComposer from './chat-composer.svelte';
import { addMention, createMentionHistory, editMentions } from '$lib/services/chat/mentions';
import { readMentionInput } from '$lib/client/agent/mention-input';
import type { ComposerSelection } from '$lib/models/chat';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('uses the real textarea selection to remove the first of two identical mentions', async () => {
	const first = { kind: 'note' as const, id: testNoteId(1), name: 'Research' };
	const second = { kind: 'note' as const, id: testNoteId(2), name: 'Research' };
	let history = addMention(createMentionHistory('Compare @'), first);
	history = editMentions(history, {
		from: history.present.text.length,
		to: history.present.text.length,
		text: 'and @'
	});
	history = addMention(history, second);
	let selection: ComposerSelection | undefined;
	const noop = () => {};
	const screen = await render(ChatComposer, {
		prompt: history.present.text,
		chips: [first, second],
		mentionCandidates: [],
		highlighted: 0,
		selectedImages: [],
		agentAvailable: true,
		isStreaming: false,
		connection: 'connected',
		executionMode: 'approval_required',
		models: [],
		modelOverride: null,
		defaultModelId: 'test',
		visionModelOverride: null,
		defaultVisionModelId: 'test',
		onremovechip: noop,
		onpinselection: noop,
		onpick: noop,
		onhighlight: noop,
		onremoveimage: noop,
		onfiles: noop,
		onkeydown: noop,
		onpaste: noop,
		ontoggleexecutionmode: noop,
		onmodelchange: noop,
		onvisionmodelchange: noop,
		onsend: noop,
		onstop: noop,
		onbeforeinput: (event) => {
			const target = event.currentTarget;
			if (!(target instanceof HTMLTextAreaElement)) throw new Error('Expected textarea');
			selection = { from: target.selectionStart, to: target.selectionEnd };
		},
		oninput: (event) => {
			const target = event.currentTarget;
			if (!(target instanceof HTMLTextAreaElement) || !(event instanceof InputEvent) || !selection)
				throw new Error('Missing browser edit details');
			const result = readMentionInput(
				history.present.text,
				target.value,
				selection,
				event.inputType
			);
			if (result.kind !== 'edit') throw new Error('Untracked browser edit');
			history = editMentions(history, result.edit);
		}
	});
	const field = screen.getByRole('textbox');
	await field.click();
	const textarea = field.element();
	if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Expected textarea');
	textarea.setSelectionRange(8, 18);
	await userEvent.keyboard('{Backspace}');
	expect({
		text: history.present.text,
		ids: history.present.references.map(({ chip }) => chip.id)
	}).toEqual({ text: 'Compare and @Research ', ids: [second.id] });
});
