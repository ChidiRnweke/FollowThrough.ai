import { describe, expect, it } from 'vitest';
import { asProvenance, provenanceOrigin, provenanceSchema } from './index';
import type { Provenance, ProvenanceRequest } from './index';

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

describe('Completing a request into a record', () => {
	const storedIdentity = {
		id: identity.id as Provenance['id'],
		userId: identity.userId as Provenance['userId'],
		createdAt: identity.createdAt as Provenance['createdAt']
	};

	const relateRequest = {
		producerKind: 'pipeline',
		producerName: 'Relate',
		pipeline: 'relate',
		sourceAnchorId: anchorId,
		metadata: {}
	} as ProvenanceRequest;

	it('keeps the arm the request was in', () => {
		expect(asProvenance(relateRequest, storedIdentity)).toMatchObject({ pipeline: 'relate' });
	});

	it('carries the identity storage supplied', () => {
		expect(asProvenance(relateRequest, storedIdentity).id).toBe(identity.id);
	});

	it('refuses a request that could never be a valid record', () => {
		const missingAnchor = {
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			metadata: {}
		} as ProvenanceRequest;
		expect(() => asProvenance(missingAnchor, storedIdentity)).toThrow();
	});
});

describe('Reading where a record came from', () => {
	it('names the pipeline for a producer that ran as one', () => {
		const record = provenanceSchema.parse(supportedProducers[2].value);
		expect(provenanceOrigin(record)).toEqual({
			pipeline: 'reference',
			createdAt: identity.createdAt
		});
	});

	it('names the producer for one that did not', () => {
		const record = provenanceSchema.parse(supportedProducers[1].value);
		expect(provenanceOrigin(record)).toEqual({
			producerName: 'document-export',
			createdAt: identity.createdAt
		});
	});
});
