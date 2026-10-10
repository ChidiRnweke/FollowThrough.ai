import { createAgentContext } from '$lib/server/factories/agent-context';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const createTestAgentContext = () => createAgentContext(testTokenizer);
