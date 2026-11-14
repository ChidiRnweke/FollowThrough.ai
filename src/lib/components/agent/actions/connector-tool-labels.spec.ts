import { describe, expect, it } from 'vitest';
import type { ConnectorCallLabel, ConnectorToolName } from '$lib/models/connectors';
import { connectorNameLabel, connectorToolLabel } from './connector-tool-labels';
import { approvalConsequence, toolStatusLabel } from './tool-presentation';

const linear: ConnectorCallLabel = { kind: 'catalog', catalogId: 'linear', title: 'Linear' };

const call = <Status extends 'running' | 'succeeded' | 'rejected'>(
	name: string,
	connector: ConnectorCallLabel,
	status: Status
) => ({
	callId: 'call-1',
	source: 'connector' as const,
	name: name as ConnectorToolName,
	connector,
	arguments: { title: 'Ship connectors' },
	status
});

describe('Connector tool labels', () => {
	it('names the service from the label frozen at call time, and shows a mark only for a catalog label', () => {
		expect({
			catalog: connectorToolLabel(call('linear__create_issue', linear, 'running')),
			// A custom server whose slug became a catalog id still reads as itself.
			custom: connectorToolLabel(
				call('stripe__list_charges', { kind: 'custom', title: 'Billing proxy' }, 'running')
			),
			camel: connectorToolLabel(call('github__getPullRequest', linear, 'running')).action
		}).toEqual({
			catalog: {
				service: 'Linear',
				action: 'Create issue',
				logo: { kind: 'catalog', catalogId: 'linear' }
			},
			custom: { service: 'Billing proxy', action: 'List charges', logo: { kind: 'monogram' } },
			camel: 'Get pull request'
		});
	});

	it('reads a call as the service and its action, in every state the row can show', () => {
		expect({
			running: toolStatusLabel(call('linear__create_issue', linear, 'running')),
			done: toolStatusLabel(call('linear__create_issue', linear, 'succeeded')),
			rejected: toolStatusLabel(call('linear__create_issue', linear, 'rejected'))
		}).toEqual({
			running: 'Linear · Create issue · Ship connectors…',
			done: 'Linear · Create issue · Ship connectors',
			rejected: 'Linear · Create issue rejected · Ship connectors'
		});
	});

	it('names a call that failed before it ran by its slug, never as a vendor', () => {
		expect({
			connector: connectorNameLabel('stripe__list_charges'),
			builtIn: connectorNameLabel('create_note')
		}).toEqual({ connector: 'stripe · List charges', builtIn: undefined });
	});

	it('warns that FollowThrough cannot undo a connector call before it is approved', () => {
		expect(approvalConsequence(call('linear__create_issue', linear, 'running'))).toBe(
			'This runs in Linear. FollowThrough cannot undo what it does there.'
		);
	});
});
