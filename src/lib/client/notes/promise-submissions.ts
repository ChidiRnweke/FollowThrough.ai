import { startExtractPromisesSchema, type StartExtractPromisesInput } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';

/** Retains an uncertain submission across a refresh, independently for each signed-in account. */
export class PromiseSubmissions {
	constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

	prepare(accountId: string, selection: TextSelection): StartExtractPromisesInput {
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

	private read(accountId: string): readonly StartExtractPromisesInput[] {
		const value = this.storage.getItem(this.key(accountId));
		return value === null ? [] : startExtractPromisesSchema.array().parse(JSON.parse(value));
	}

	private key(accountId: string): string {
		return `followthrough.notes.promise-submissions.${accountId}`;
	}
}
