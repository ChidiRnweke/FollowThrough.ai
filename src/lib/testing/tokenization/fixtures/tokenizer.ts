import { Cl100kTokenizer } from '$lib/server/infrastructure/tokenization/cl100k';
/** One real fixed vocabulary for this test process; no request or account state. */
export const testTokenizer = new Cl100kTokenizer();
