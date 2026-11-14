import { isHttpError } from '@sveltejs/kit';

/**
 * What a refused connector command tells the user. A domain refusal names the
 * fix — a server that would not answer, a token it rejected, a sign-in it no
 * longer accepts (ADR 0035) — so it is shown as written. Any other failure
 * shows the fallback, because its message was not written for the user.
 */
export const refusalMessage = (error: unknown, fallback: string): string =>
	isHttpError(error) && error.body.code !== undefined ? error.body.message : fallback;
