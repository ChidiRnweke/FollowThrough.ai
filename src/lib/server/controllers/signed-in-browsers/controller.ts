import type { SessionId, SessionToken, SignedInBrowser } from '$lib/models/identity';
import type { SignedInBrowserLedger } from '$lib/server/services/identity/sessions';

/**
 * The user's own signed-in browsers. `current` is the token of the browser that asks; only its
 * digest is compared, and no token ever leaves the server.
 */
export interface SignedInBrowsersController {
	/** The sessions that still admit a browser, with the asking browser marked `current`. */
	list(current: SessionToken): Promise<readonly SignedInBrowser[]>;
	/** Sign one browser out; its next request goes to the sign-in page. */
	signOut(id: SessionId): Promise<void>;
	/** Sign out every browser but the asking one; answers how many were signed out. */
	signOutOthers(current: SessionToken): Promise<number>;
}

export interface SignedInBrowsersDependencies {
	readonly browsers: SignedInBrowserLedger;
}

export class SignedInBrowsers implements SignedInBrowsersController {
	constructor(private readonly dependencies: SignedInBrowsersDependencies) {}

	list(current: SessionToken): Promise<readonly SignedInBrowser[]> {
		return this.dependencies.browsers.list(current);
	}

	signOut(id: SessionId): Promise<void> {
		return this.dependencies.browsers.signOut(id);
	}

	signOutOthers(current: SessionToken): Promise<number> {
		return this.dependencies.browsers.signOutOthers(current);
	}
}
