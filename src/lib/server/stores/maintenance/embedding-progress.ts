/** One embedding worker's durable-source traversal position. */
export class EmbeddingProgressStore {
	private after: string | undefined;
	read(): string | undefined {
		return this.after;
	}
	update(after: string | undefined): void {
		this.after = after;
	}
}
