import { describe, expect, it } from 'vitest';
import type { ConnectorToolName } from '$lib/models/connectors';
import { connectorToolLabel } from './connector-tool-labels';
import { approvalConsequence, toolStatusLabel } from './tool-presentation';

const call = <Status extends 'running' | 'succeeded' | 'rejected'>(
	name: string,
	status: Status
) => ({
	callId: 'call-1',
	source: 'connector' as const,
	name: name as ConnectorToolName,
	arguments: { title: 'Ship connectors' },
	status
});

describe('Connector tool labels', () => {
	it('names a catalog service by its title and mark, and a custom server by its slug alone', () => {
		expect({
			catalog: connectorToolLabel('linear__create_issue'),
			custom: connectorToolLabel('teamdocs__search-docs'),
			camel: connectorToolLabel('github__getPullRequest')?.action,
			builtIn: connectorToolLabel('create_note')
		}).toEqual({
			catalog: {
				service: 'Linear',
				action: 'Create issue',
				logo: { kind: 'catalog', catalogId: 'linear' }
			},
			custom: { service: 'teamdocs', action: 'Search docs', logo: { kind: 'monogram' } },
			camel: 'Get pull request',
			builtIn: undefined
		});
	});

	it('reads a call as the service and its action, in every state the row can show', () => {
		expect({
			running: toolStatusLabel(call('linear__create_issue', 'running')),
			done: toolStatusLabel(call('linear__create_issue', 'succeeded')),
			rejected: toolStatusLabel(call('linear__create_issue', 'rejected'))
		}).toEqual({
			running: 'Linear · Create issue · Ship connectors…',
			done: 'Linear · Create issue · Ship connectors',
			rejected: 'Linear · Create issue rejected · Ship connectors'
		});
	});

	it('warns that FollowThrough cannot undo a connector call before it is approved', () => {
		expect(approvalConsequence('linear__create_issue')).toBe(
			'This runs in Linear. FollowThrough cannot undo what it does there.'
		);
	});
});
