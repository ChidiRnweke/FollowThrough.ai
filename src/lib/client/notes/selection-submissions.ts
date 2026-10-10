import {
	selectionSubmissionSchema,
	type SelectionAction,
	type SelectionSubmission
} from '$lib/models/notes';
import type { SelectionSubmissionStorage } from '$lib/models/browser-workspace';
/** Browser persistence and reading only. No selection matching or submission workflow. */
export class BrowserSelectionSubmissionStorage implements SelectionSubmissionStorage {
	constructor(
		private readonly storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
	) {}
	read(accountId: string, action: SelectionAction): readonly SelectionSubmission[] {
		const value = this.storage().getItem(this.key(accountId, action));
		return value === null ? [] : selectionSubmissionSchema.array().parse(JSON.parse(value));
	}
	write(
		accountId: string,
		action: SelectionAction,
		requests: readonly SelectionSubmission[]
	): void {
		const storage = this.storage();
		const key = this.key(accountId, action);
		if (requests.length) storage.setItem(key, JSON.stringify(requests));
		else storage.removeItem(key);
	}
	private key(accountId: string, action: SelectionAction): string {
		return `followthrough.notes.${action === 'promises' ? 'promise' : action}-submissions.${accountId}`;
	}
}
