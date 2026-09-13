import { isForeignKeyViolation } from '$lib/server/db/postgres-errors';

/** A validated sync command can outlive a referenced resource. Other constraints indicate defects. */
export const workspaceWriteRejection = (error: unknown): string | null =>
	isForeignKeyViolation(error)
		? 'A referenced item is no longer available. Review or discard this change.'
		: null;
