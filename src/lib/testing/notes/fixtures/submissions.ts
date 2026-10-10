import { NoteActions } from '$lib/controllers/notes/actions';
import { NoteActionStore } from '$lib/stores/notes/note-actions.svelte';
import { BrowserSelectionSubmissionStorage } from '$lib/client/notes/selection-submissions';
import { BrowserDiagramSubmissionStorage } from '$lib/client/notes/diagram-submissions';
import { NoteActionIdentityService } from '$lib/services/notes/action-identities';
import { InMemoryNoteSubmissionRemote } from '$lib/testing/notes/fakes/submissions';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { NoteReviewRemote } from '$lib/models/browser-workspace';
import type { SelectionAction, TextSelection } from '$lib/models/notes';
import type { DiagramActionInput } from '$lib/models/diagrams';
export const noteSubmissionFixture = (
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
	accountId = 'note-action-test',
	reviews = capabilityDependencies<NoteReviewRemote>({})
) => {
	const remote = new InMemoryNoteSubmissionRemote();
	const session: { accountId: string | null; generation: number } = { accountId, generation: 0 };
	const selections = new BrowserSelectionSubmissionStorage(() => storage);
	const diagrams = new BrowserDiagramSubmissionStorage(() => storage);
	const actions = new NoteActions(
		new NoteActionStore(),
		session,
		selections,
		diagrams,
		new NoteActionIdentityService(),
		remote,
		{ create: () => crypto.randomUUID() },
		reviews
	);
	const bind = (accountId: string) => {
		if (session.accountId !== accountId) {
			session.accountId = accountId;
			session.generation++;
		}
	};
	const submitSelection = (accountId: string, action: SelectionAction, input: TextSelection) => {
		bind(accountId);
		switch (action) {
			case 'promises':
				return actions.extractPromises(input);
			case 'relate':
				return actions.relate(input);
			case 'reference':
				return actions.findReferences(input);
		}
	};
	const submitDiagram = (accountId: string, input: DiagramActionInput) => {
		bind(accountId);
		switch (input.operation) {
			case 'generate':
				return actions.generateDiagram(input.selection);
			case 'revise':
				return actions.reviseDiagram(
					input.noteId,
					input.source,
					input.instruction,
					input.renderedPngDataUrl
				);
			case 'convert':
				return actions.convertDiagram(input.noteId, input.source, input.instruction);
		}
	};
	return {
		remote,
		actions,
		session,
		selections,
		diagrams,
		submitSelection,
		submitDiagram,
		uncertainSelection: async (
			accountId: string,
			action: SelectionAction,
			input: TextSelection
		) => {
			const receipt = await submitSelection(accountId, action, input);
			if (receipt || actions.lastError !== remote.failure?.message)
				throw new Error('Expected an uncertain receipt');
			const sent = remote.selections.at(-1);
			if (!sent) throw new Error('No selection was submitted');
			return sent.request;
		},
		uncertainDiagram: async (accountId: string, input: DiagramActionInput) => {
			const receipt = await submitDiagram(accountId, input);
			if (receipt || actions.lastError !== remote.failure?.message)
				throw new Error('Expected an uncertain receipt');
			const sent = remote.diagrams.at(-1);
			if (!sent) throw new Error('No diagram was submitted');
			return sent;
		}
	};
};
