/** Composition identity only. Values retain the lifetime of their owning key. */
export interface WorkspaceCapabilityRegistry<T> {
	set(owner: object, value: T): void;
	get(owner: object): T;
}
export class WorkspaceCapabilityStore<T> implements WorkspaceCapabilityRegistry<T> {
	private readonly values = new WeakMap<object, T>();
	set(owner: object, value: T): void {
		this.values.set(owner, value);
	}
	get(owner: object): T {
		const value = this.values.get(owner);
		if (!value) throw new Error('The workspace capability was not assembled');
		return value;
	}
}
