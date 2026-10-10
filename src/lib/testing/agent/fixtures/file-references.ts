import {
	AgentVirtualFiles,
	type AgentVirtualFilesDependencies
} from '$lib/server/services/agent-files/virtual-files';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const agentFileReferencesFixture = () =>
	new AgentVirtualFiles(
		capabilityDependencies<AgentVirtualFilesDependencies>({
			tokens: testTokenizer,
			noteMarkdown: new NodeNoteMarkdown()
		})
	);
