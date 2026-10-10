import {
	diagramActionSubmissionSchema,
	type DiagramActionSubmission,
	type DiagramActionInput
} from '$lib/models/diagrams';
import type { DiagramSubmissionStorage } from '$lib/models/browser-workspace';
/** Parse and normalize the write candidate and persisted rows at the browser boundary. */
export class BrowserDiagramSubmissionStorage implements DiagramSubmissionStorage {
	constructor(
		private readonly storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
	) {}
	read(accountId: string): readonly DiagramActionSubmission[] {
		const value = this.storage().getItem(this.key(accountId));
		return value === null ? [] : diagramActionSubmissionSchema.array().parse(JSON.parse(value));
	}
	write(accountId: string, requests: readonly DiagramActionSubmission[]): void {
		const storage = this.storage();
		const key = this.key(accountId);
		if (requests.length) storage.setItem(key, JSON.stringify(requests));
		else storage.removeItem(key);
	}
	candidate(input: DiagramActionInput, requestId: string): DiagramActionSubmission {
		return diagramActionSubmissionSchema.parse({ ...input, requestId });
	}
	private key(accountId: string): string {
		return `followthrough.notes.diagram-submissions.${accountId}`;
	}
}
