/**
 * Which methods the boundary traces. `true` logs a summary of the arguments and
 * the result; `'redacted'` traces and logs the call without either, for a method
 * whose arguments or result carry a credential.
 */
export type ControllerSurface<T> = {
	readonly [K in keyof T]:
		| false
		| (T[K] extends (...args: never[]) => PromiseLike<infer _Value> ? true | 'redacted' : never);
};
