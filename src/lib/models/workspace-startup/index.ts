export type WorkspaceReadiness =
	| { kind: 'ready' }
	| { kind: 'loading' }
	| { kind: 'offline' }
	| { kind: 'failure'; message: string };

export interface WorkspaceStartupFacts {
	userKnown: boolean;
	inboxKnown: boolean;
	preferencesKnown: boolean;
	inventoryComplete: boolean;
	online: boolean;
	failure: string | null;
}
