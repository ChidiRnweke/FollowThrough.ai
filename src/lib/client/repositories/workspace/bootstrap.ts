import {
	workspaceBootstrapKey,
	workspaceBootstrapSchema,
	type StoredBootstrap,
	type WorkspaceBootstrap
} from '$lib/models/workspace-bootstrap';

/** Only deployment metadata and the active account binding; workspace records live in IndexedDB. */
export interface WorkspaceBootstrapRepository {
	read(accountHint: string | null): StoredBootstrap;
	save(bootstrap: WorkspaceBootstrap): void;
}

const readStoredBootstrap = (
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

/** Reads `localStorage` on use, so the module loads where there is none. */
export class LocalStorageBootstrap implements WorkspaceBootstrapRepository {
	constructor(
		private readonly storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () =>
			localStorage
	) {}
	read(accountHint: string | null): StoredBootstrap {
		return readStoredBootstrap(this.storage().getItem(workspaceBootstrapKey), accountHint);
	}
	save(bootstrap: WorkspaceBootstrap): void {
		this.storage().setItem(workspaceBootstrapKey, JSON.stringify(bootstrap));
		this.storage().removeItem('followthrough-workspace-bootstrap-v1');
	}
}
