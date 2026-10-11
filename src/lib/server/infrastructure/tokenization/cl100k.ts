import { getEncoding, type Tiktoken } from 'js-tiktoken';
import type { TokenCodec } from '$lib/models/tokenization';

/** Immutable SDK vocabulary, scoped to the graph which constructs this adapter. */
export class Cl100kTokenizer implements TokenCodec {
	private readonly encoding: Tiktoken;
	constructor() {
		this.encoding = getEncoding('cl100k_base');
	}
	count(text: string): number {
		return this.encoding.encode(text).length;
	}
	encode(text: string): number[] {
		return this.encoding.encode(text);
	}
	decode(tokens: readonly number[]): string {
		return this.encoding.decode([...tokens]);
	}
}
