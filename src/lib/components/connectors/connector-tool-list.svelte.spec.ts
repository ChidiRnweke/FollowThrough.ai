import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConnectorToolPolicyChoice, ConnectorToolView } from '$lib/models/connectors';
import { connectorToolView } from '$lib/testing/connectors/fixtures/views';
import ConnectorToolList from './connector-tool-list.svelte';

type Choice = readonly [string, ConnectorToolPolicyChoice | 'default'];

const show = (tools: readonly ConnectorToolView[]) => {
	const chosen: Choice[] = [];
	const screen = render(ConnectorToolList, {
		service: 'Linear',
		tools,
		disabled: false,
		onchoose: (tool, policy) => chosen.push([tool.serverName, policy])
	});
	return { screen, chosen };
};

describe('A connector’s tool settings', () => {
	it('shows a write tool asking by default and a read tool running, as their labels decide', async () => {
		const { screen } = show([
			connectorToolView('create_issue', { readOnly: false }),
			connectorToolView('list_issues', { readOnly: true })
		]);
		const write = screen.getByRole('group', { name: 'When the agent calls create_issue' });
		const read = screen.getByRole('group', { name: 'When the agent calls list_issues' });
		await expect.element(write.getByRole('radio', { name: 'Ask' })).toBeChecked();
		await expect.element(read.getByRole('radio', { name: 'Always allow' })).toBeChecked();
		await expect.element(screen.getByText('Can change or delete data · default')).toBeVisible();
		await expect.element(screen.getByText('Marked read-only · default')).toBeVisible();
	});

	it('reports a new setting, and nothing for the setting already in force', async () => {
		const { screen, chosen } = show([connectorToolView('create_issue', { readOnly: false })]);
		const group = screen.getByRole('group', { name: 'When the agent calls create_issue' });
		const ask = group.getByRole('radio', { name: 'Ask' });
		await ask.click();
		await expect.element(ask).toBeChecked();
		await group.getByRole('radio', { name: 'Off' }).click();
		expect(chosen).toEqual([['create_issue', 'off']]);
	});

	it('hands a chosen setting back to the default, and offers that only once a choice exists', async () => {
		const { screen, chosen } = show([
			connectorToolView('create_issue', {
				readOnly: false,
				policy: { kind: 'chosen', choice: 'allow' }
			}),
			connectorToolView('list_issues', { readOnly: true })
		]);
		const reset = screen.getByRole('button', { name: 'Use default' });
		const offered = reset.elements().length;
		await reset.click();
		expect({ offered, chosen }).toEqual({ offered: 1, chosen: [['create_issue', 'default']] });
	});

	it('explains a tool the agent cannot use instead of offering settings for it', async () => {
		const { screen } = show([
			connectorToolView('upload_file', {
				readOnly: false,
				schema: { kind: 'unusable', reason: 'Its input schema uses an unsupported draft.' }
			})
		]);
		await expect
			.element(screen.getByText('Cannot be used: Its input schema uses an unsupported draft.'))
			.toBeVisible();
		await expect
			.element(screen.getByRole('group', { name: 'When the agent calls upload_file' }))
			.not.toBeInTheDocument();
	});
});
