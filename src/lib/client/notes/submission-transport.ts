import type { NoteSubmissionRemote, NoteSubmissionIdentity } from '$lib/models/browser-workspace';
import type { SelectionAction, SelectionSubmission } from '$lib/models/notes';
import type { DiagramActionSubmission } from '$lib/models/diagrams';
import {
	extractPromises,
	relateNote,
	findReferences,
	generateDiagram,
	reviseDiagram,
	convertDiagram
} from '$lib/remote/notes/notes.remote';
export class RemoteNoteSubmissions implements NoteSubmissionRemote {
	selection(action: SelectionAction, request: SelectionSubmission) {
		switch (action) {
			case 'promises':
				return extractPromises(request);
			case 'reference':
				return findReferences(request);
			case 'relate':
				return relateNote(request);
		}
	}
	diagram(request: DiagramActionSubmission) {
		switch (request.operation) {
			case 'generate': {
				const { operation: _operation, ...input } = request;
				return generateDiagram(input);
			}
			case 'revise': {
				const { operation: _operation, ...input } = request;
				return reviseDiagram(input);
			}
			case 'convert': {
				const { operation: _operation, ...input } = request;
				return convertDiagram(input);
			}
		}
	}
}
export class BrowserNoteSubmissionIdentity implements NoteSubmissionIdentity {
	create(): string {
		return crypto.randomUUID();
	}
}
