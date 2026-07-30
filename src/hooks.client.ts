import type { HandleClientError } from '@sveltejs/kit';
import { DomainError } from '$lib/errors';
import { describeClientError, reportClientError } from '$lib/client/report-error';

/**
 * The single reporting choke point for the browser.
 *
 * `experimental.handleRenderingErrors` is on (vite.config.ts), which makes Kit
 * pass a `transformError` to the root component. Every `<svelte:boundary>` in
 * the app therefore routes its error through here *before* the `failed` snippet
 * sees it — so boundaries deliberately do not report for themselves, and the
 * object they receive is the `App.Error` returned below.
 *
 * Must never throw.
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
	try {
		// Domain failures are expected outcomes carrying their own message. They are
		// not bugs and are not worth a report.
		if (error instanceof DomainError) {
			return { message: error.message, code: error.code };
		}

		const described = describeClientError(error);
		console.error(`[client] ${described}`);
		reportClientError({
			message: described,
			stack: error instanceof Error ? error.stack : undefined,
			route: event.route.id ?? undefined,
			pathname: event.url.pathname,
			status
		});
	} catch {
		// A failure in the error handler would take down the very thing meant to
		// keep the app up.
	}

	return { message };
};
