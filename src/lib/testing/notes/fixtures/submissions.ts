import { NoteSubmissions } from '$lib/controllers/notes/submissions';
import { BrowserSelectionSubmissionStorage } from '$lib/client/notes/selection-submissions';
import { BrowserDiagramSubmissionStorage } from '$lib/client/notes/diagram-submissions';
import { NoteActionIdentityService } from '$lib/services/notes/action-identities';
import { InMemoryNoteSubmissionRemote } from '$lib/testing/notes/fakes/submissions';
import type { SelectionAction, TextSelection } from '$lib/models/notes';
import type { DiagramActionInput } from '$lib/models/diagrams';
export const noteSubmissionFixture = (storage: Storage) => {
	const remote = new InMemoryNoteSubmissionRemote();
	const controller = new NoteSubmissions(
		new BrowserSelectionSubmissionStorage(() => storage),
		new BrowserDiagramSubmissionStorage(() => storage),
		new NoteActionIdentityService(),
		remote,
		{ create: () => crypto.randomUUID() }
	);
	return {
		remote,
		controller,
		uncertainSelection: (accountId: string, action: SelectionAction, input: TextSelection) =>
			controller.selection(accountId, action, input).then((outcome) => {
				if (outcome.kind === 'started' || outcome.message !== remote.failure?.message)
					throw new Error('Expected an uncertain receipt');
				const sent = remote.selections.at(-1);
				if (!sent) throw new Error('No selection was submitted');
				return sent.request;
			}),
		uncertainDiagram: (accountId: string, input: DiagramActionInput) =>
			controller.diagram(accountId, input).then((outcome) => {
				if (outcome.kind === 'started' || outcome.message !== remote.failure?.message)
					throw new Error('Expected an uncertain receipt');
				const sent = remote.diagrams.at(-1);
				if (!sent) throw new Error('No diagram was submitted');
				return sent;
			})
	};
};
