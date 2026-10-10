import type {
	WorkbenchStorage,
	WorkbenchLayoutRepository,
	WorkbenchPreferences,
	WorkbenchConversations
} from '$lib/controllers/workbench/contracts';
export class InMemoryWorkbenchStorage implements WorkbenchStorage {
	readonly accounts = new Map<string, WorkbenchLayoutRepository>();
	open(account: string): WorkbenchLayoutRepository {
		const repository = this.accounts.get(account);
		if (!repository) throw new Error('No layout registered for account');
		return repository;
	}
}
export class InMemoryWorkbenchPreferences implements WorkbenchPreferences {
	stripHidden: boolean | undefined;
	splitRatio: number | undefined;
	readonly errors: Error[] = [];
	read() {
		return { stripHidden: this.stripHidden, splitRatio: this.splitRatio };
	}
	writeStripHidden(value: boolean): void {
		this.stripHidden = value;
	}
	writeSplitRatio(value: number): void {
		this.splitRatio = value;
	}
	report(error: Error): void {
		this.errors.push(error);
	}
}
export class InMemoryWorkbenchConversations implements WorkbenchConversations {
	readonly conversations = new Map<string, { readonly conversationId: string | undefined }>();
	peek(key: string) {
		return this.conversations.get(key);
	}
}
