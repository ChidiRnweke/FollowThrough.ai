import {
	selectionSubmissionSchema,
	type SelectionSubmission,
	type TextSelection
} from '$lib/models/notes';

/** Retains an uncertain submission across a refresh, independently for each signed-in account. */
export class SelectionSubmissions {
	constructor(
		private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
		private readonly action: 'promises' | 'reference' | 'relate'
	) {}

	prepare(accountId: string, selection: TextSelection): SelectionSubmission {
		const requests = this.read(accountId);
		const existing = requests.find((request) => {
			const previous = request.selection;
			return (
				previous.noteId === selection.noteId &&
				previous.revision === selection.revision &&
				previous.from === selection.from &&
				previous.to === selection.to &&
				previous.text === selection.text
			);
		});
		if (existing) return existing;
		const request = { requestId: crypto.randomUUID(), selection };
		this.storage.setItem(this.key(accountId), JSON.stringify([...requests, request]));
		return request;
	}

	acknowledge(accountId: string, requestId: string): void {
		const remaining = this.read(accountId).filter((request) => request.requestId !== requestId);
		if (remaining.length) this.storage.setItem(this.key(accountId), JSON.stringify(remaining));
		else this.storage.removeItem(this.key(accountId));
	}

	private read(accountId: string): readonly SelectionSubmission[] {
		const value = this.storage.getItem(this.key(accountId));
		return value === null ? [] : selectionSubmissionSchema.array().parse(JSON.parse(value));
	}

	private key(accountId: string): string {
		const action = this.action === 'promises' ? 'promise' : this.action;
		return `followthrough.notes.${action}-submissions.${accountId}`;
	}
}
