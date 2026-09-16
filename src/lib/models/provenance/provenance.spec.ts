import { describe, expect, it } from 'vitest';
import { provenanceSchema } from './index';

const identity = {
	id: '10000000-0000-4000-8000-000000000001',
	userId: '20000000-0000-4000-8000-000000000002',
	createdAt: '2026-08-30T10:30:00.000Z'
};

const anchorId = '30000000-0000-4000-8000-000000000003';
const runId = '40000000-0000-4000-8000-000000000004';

const supportedProducers = [
	{
		label: 'skill selection',
		value: {
			...identity,
			producerKind: 'user',
			producerName: 'Create Skill From Selection',
			sourceAnchorId: anchorId,
			metadata: {}
		}
	},
	{
		label: 'document export',
		value: { ...identity, producerKind: 'user', producerName: 'document-export', metadata: {} }
	},
	{
		label: 'reference pipeline',
		value: {
			...identity,
			producerKind: 'pipeline',
			producerName: 'Reference',
			pipeline: 'reference',
			sourceAnchorId: anchorId,
			metadata: {}
		}
	},
	{
		label: 'promise extraction pipeline',
		value: {
			...identity,
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			sourceAnchorId: anchorId,
			metadata: {}
		}
	},
	{
		label: 'relationship pipeline',
		value: {
			...identity,
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			sourceAnchorId: anchorId,
			metadata: {}
		}
	},
	{
		label: 'memory agent',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'Agent memory',
			pipeline: 'memory',
			metadata: {}
		}
	},
	{
		label: 'MCP client',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope: 'full' }
		}
	},
	{
		label: 'workbench agent',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'FollowThrough Workbench Agent',
			pipeline: 'agent',
			runId,
			model: 'gpt-5',
			metadata: {}
		}
	},
	{
		label: 'mermaid agent',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'Mermaid Diagram Creator',
			pipeline: 'agent',
			sourceAnchorId: anchorId,
			metadata: {}
		}
	},
	{
		label: 'inline diagram conversion',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'Diagram Agent',
			pipeline: 'agent',
			metadata: { operation: 'convert' }
		}
	},
	{
		label: 'diagram promotion',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'Diagram Agent',
			pipeline: 'agent',
			metadata: {
				operation: 'convert',
				sourceDiagramId: '50000000-0000-4000-8000-000000000005'
			}
		}
	},
	{
		label: 'diagram workflow',
		value: {
			...identity,
			producerKind: 'agent',
			producerName: 'Diagram Agent',
			pipeline: 'agent',
			runId,
			model: 'gpt-5',
			metadata: {
				conversationId: '60000000-0000-4000-8000-000000000006',
				operation: 'generate'
			}
		}
	}
] as const;

describe('Reading stored provenance', () => {
	it.each(supportedProducers)('accepts stored $label provenance', ({ value }) => {
		expect(provenanceSchema.safeParse(value).success).toBe(true);
	});

	it('refuses stored relationship provenance without its source anchor', () => {
		const missingAnchor = {
			...identity,
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			metadata: {}
		};
		expect(() => provenanceSchema.parse(missingAnchor)).toThrow();
	});
});
