import {
	workspaceBootstrapSchema,
	workspaceAccountCookieName,
	type WorkspaceBootstrap
} from '$lib/models/workspace-bootstrap';

export const workspaceBootstrapKey = 'followthrough-workspace-bootstrap-v2';
export type StoredBootstrap =
	| { kind: 'absent' }
	| { kind: 'stored'; value: WorkspaceBootstrap }
	| { kind: 'corrupt'; message: string };

/** Only deployment metadata and the active account binding; workspace records live in IndexedDB. */
export const readStoredBootstrap = (
	stored: string | null,
	accountHint: string | null
): StoredBootstrap => {
	try {
		if (stored === null || accountHint === null) return { kind: 'absent' };
		const value = workspaceBootstrapSchema.parse(JSON.parse(stored));
		return value.accountId === accountHint ? { kind: 'stored', value } : { kind: 'absent' };
	} catch (error) {
		return {
			kind: 'corrupt',
			message:
				error instanceof Error ? error.message : 'The saved workspace bootstrap is unreadable'
		};
	}
};
export const storeBootstrap = (
	storage: Pick<Storage, 'setItem' | 'removeItem'>,
	value: WorkspaceBootstrap
): void => {
	storage.setItem(workspaceBootstrapKey, JSON.stringify(value));
	storage.removeItem('followthrough-workspace-bootstrap-v1');
};
export const clearBootstrap = (storage: Pick<Storage, 'removeItem'>): void => {
	storage.removeItem(workspaceBootstrapKey);
};

/** This readable cookie is only an account hint; every server request still authenticates normally. */
export const workspaceAccountHint = (cookies: string): string | null => {
	const prefix = `${workspaceAccountCookieName}=`;
	const found = cookies
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));
	if (!found) return null;
	const account = workspaceBootstrapSchema.shape.accountId.safeParse(found.slice(prefix.length));
	return account.success ? account.data : null;
};
