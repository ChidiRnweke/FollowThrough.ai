/** The fixed encoding used for retrieval and virtual-file accounting. */
export interface TokenCounter {
	count(text: string): number;
}
export interface TokenCodec extends TokenCounter {
	encode(text: string): number[];
	decode(tokens: readonly number[]): string;
}
