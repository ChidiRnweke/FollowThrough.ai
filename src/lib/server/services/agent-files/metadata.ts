import type { Diagram } from '$lib/models/diagrams';
import { createHash } from 'node:crypto';
import type {
	AgentFile,
	AgentFileId,
	AgentFileContentMeasurement,
	AgentFileMaterialization as FileMaterialization
} from '$lib/models/agent-files';

interface AgentFileMaterialization {
	file: FileMaterialization['file'];
	diagram: FileMaterialization['diagram'];
}

export class AgentFileMetadataService implements AgentFileMaterialization {
	constructor(private readonly measurement: AgentFileContentMeasurement) {}
	file(path: string, mediaType: string, content: string): AgentFile {
		return {
			metadata: {
				kind: 'file',
				id: createHash('sha256').update(path).digest('hex') as AgentFileId,
				path,
				mediaType,
				...this.measurement.measure(content)
			},
			content
		};
	}
	diagram(path: string, diagram: Pick<Diagram, 'kind' | 'source'>): AgentFile {
		return this.file(
			path,
			diagram.kind === 'mermaid' ? 'text/vnd.mermaid' : 'application/vnd.jgraph.mxfile+xml',
			diagram.source
		);
	}
}
