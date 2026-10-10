import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
it.each(['closed', 'replaced'] as const)(
	'does not deliver an inline URL into a %s editor',
	async (change) => {
		const { controller, remote, editors } = attachmentActionsFixture();
		const identity = { key: Symbol('editor') };
		const state = new NoteEditorOperationStore();
		state.initialize();
		editors.set(identity, { state });
		const gate = Promise.withResolvers<void>();
		remote.completionGate = gate.promise;
		const pending = controller
			.uploadInline(testNoteId(), new File(['image'], 'image.png', { type: 'image/png' }), identity)
			.then(
				() => 'unexpected URL',
				(error: Error) => error.message
			);
		await remote.completionStarted.promise;
		if (change === 'closed') state.release();
		else {
			state.setInitialized(false);
			state.setInitialized(true);
		}
		gate.resolve();
		expect(await pending).toBe('The image editor changed during the upload.');
	}
);
it('returns a completed URL to the same live editor', async () => {
	const { controller, remote, editors } = attachmentActionsFixture();
	const identity = { key: Symbol('editor') };
	const state = new NoteEditorOperationStore();
	state.initialize();
	editors.set(identity, { state });
	expect(
		await controller.uploadInline(
			testNoteId(),
			new File(['image'], 'image.png', { type: 'image/png' }),
			identity
		)
	).toBe(`/api/attachments/${remote.result.attachment.id}/content`);
});
