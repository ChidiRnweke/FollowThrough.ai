import { getEncoding, type Tiktoken } from 'js-tiktoken';

let encoding: Tiktoken | undefined;

/** Shared cl100k tokenizer used by the OpenAI embedding model and prompt budgets. */
export const retrievalEncoding = (): Tiktoken => {
	encoding ??= getEncoding('cl100k_base');
	return encoding;
};

export const countRetrievalTokens = (value: string): number =>
	retrievalEncoding().encode(value).length;

export const sliceRetrievalTokens = (value: string, start: number, end?: number): string =>
	retrievalEncoding().decode(retrievalEncoding().encode(value).slice(start, end));
