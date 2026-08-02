import type { AtomicOperation } from '$lib/models/workspace';

/** The capability-neutral transaction boundary every multi-step controller operation runs inside, so a failure partway through never leaves related rows half-written. */
export type TransactionRunner = AtomicOperation;
