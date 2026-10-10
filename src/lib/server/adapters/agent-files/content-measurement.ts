import { createHash } from 'node:crypto';
import type {
	AgentFileContentMetadata,
	AgentFileContentMeasurement
} from '$lib/models/agent-files';
import type { TokenCounter } from '$lib/models/tokenization';

/** Exact content measurements; the caller owns path identity and persistence. */
export class AgentFileContentMeter implements AgentFileContentMeasurement {
	constructor(private readonly tokens: TokenCounter) {}
	measure(content: string): AgentFileContentMetadata {
		return {
			byteSize: Buffer.byteLength(content, 'utf8'),
			tokenCount: this.tokens.count(content),
			lineCount: content.length === 0 ? 0 : content.split('\n').length,
			checksumSha256: createHash('sha256').update(content).digest('hex')
		};
	}
}
