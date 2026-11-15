import { ExternalServiceError } from '$lib/errors';
import type { FetchLike } from './outbound';

/** A fetch whose every request also stops when `signal` aborts. */
export const fetchUntil =
	(fetch: FetchLike, signal: AbortSignal): FetchLike =>
	(url, init) =>
		fetch(url, {
			...init,
			signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal
		});

/**
 * The total time one connector operation may take (CONNECTOR_OPERATION_TIMEOUT_MS).
 * Each operation starts its own, and every request it makes carries the signal, so
 * no number of pages, redirects or slow bodies can keep the operation open past it.
 */
export class OperationDeadline {
	readonly signal: AbortSignal;

	constructor(private readonly timeoutMs: number) {
		this.signal = AbortSignal.timeout(timeoutMs);
	}

	/** Whether the deadline has passed. */
	get passed(): boolean {
		return this.signal.aborted;
	}

	/** The failure an operation reports once its deadline passed. */
	failure(host: string): ExternalServiceError {
		return new ExternalServiceError(
			`${host} did not finish answering within ${this.timeoutMs} ms. Try again later.`,
			{ cause: `CONNECTOR_OPERATION_TIMEOUT_MS is ${this.timeoutMs}` }
		);
	}
}
