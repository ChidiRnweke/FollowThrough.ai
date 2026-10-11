export type ControllerSurface<T> = {
	readonly [K in keyof T]:
		false | (T[K] extends (...args: never[]) => PromiseLike<infer _Value> ? true : never);
};
