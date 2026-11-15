import type { DateTime } from '$lib/models/workspace';

/** Reports with one fingerprint are the same failure seen again. */
export type ClientErrorFingerprint = string & { readonly __brand: 'ClientErrorFingerprint' };

/** Whether the user's report budget had room, as the store decided it under one lock. */
export type ClientErrorReservation =
	| { readonly kind: 'reserved'; readonly suppressed: number }
	| { readonly kind: 'duplicate' }
	| { readonly kind: 'exhausted'; readonly oldest: DateTime };

/** The actor's admitted browser error reports, counted against a rolling window. */
export interface ClientErrorReportRepository {
	/**
	 * Under one per-user lock: a report whose fingerprint was admitted since `since` is counted
	 * as suppressed and not admitted again; otherwise one is admitted at `at` when fewer than
	 * `limit` were admitted since `since`. An admission carries the repeats suppressed since the
	 * user's previous admission and resets that count.
	 */
	reserve(
		fingerprint: ClientErrorFingerprint,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<ClientErrorReservation>;
}
