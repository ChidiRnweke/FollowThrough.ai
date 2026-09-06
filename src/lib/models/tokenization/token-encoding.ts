import { getEncoding, type Tiktoken } from 'js-tiktoken';

let shared: Tiktoken | undefined;

export const tokenEncoding = (): Tiktoken => (shared ??= getEncoding('cl100k_base'));
