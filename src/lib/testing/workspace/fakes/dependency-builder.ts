/**
 * Builds a controller dependency bundle for a focused unit test.
 *
 * Missing collaborators fail only if the test unexpectedly crosses its declared boundary,
 * which keeps each fixture small while preserving compile-time checking for every override.
 */
export function capabilityDependencies<T extends object>(overrides: Partial<T>): T {
	return new Proxy(overrides, {
		get(target, property, receiver) {
			if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
			throw new Error(`Unexpected dependency access: ${String(property)}`);
		}
	}) as T;
}
