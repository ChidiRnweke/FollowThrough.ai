import type { UserId } from '$lib/models/identity';

/**
 * Which methods the boundary traces. `true` logs a summary of the arguments and
 * the result; `'redacted'` traces and logs the call without either, for a method
 * whose arguments or result carry a credential. A returned failure's reason is
 * logged either way, because it never carries the credential.
 */
export type ControllerSurface<T> = {
	readonly [K in keyof T]:
		| false
		| (T[K] extends (...args: never[]) => PromiseLike<infer _Value> ? true | 'redacted' : never);
};

/**
 * Who a controller acts for. A per-user composition binds its actor when it is built, so the
 * boundary can name the user; authentication and system work act for nobody.
 */
export type BoundaryScope =
	{ readonly kind: 'actor'; readonly userId: UserId } | { readonly kind: 'system' };
