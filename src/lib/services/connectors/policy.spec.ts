import { describe, expect, it } from 'vitest';
import type { ConnectorToolHints } from '$lib/models/connectors';
import { ConnectorToolPolicyRules } from './policy';

const hints = (readOnly: boolean): ConnectorToolHints => ({
	readOnly,
	destructive: !readOnly,
	idempotent: false,
	openWorld: true
});

describe('connector tool policy', () => {
	const rules = new ConnectorToolPolicyRules();

	it('runs a read-only tool without asking and asks before any other tool', () => {
		expect({
			readOnly: rules.effective({ kind: 'default' }, hints(true)),
			write: rules.effective({ kind: 'default' }, hints(false))
		}).toEqual({ readOnly: 'allow', write: 'ask' });
	});

	it('lets the user override the hints in either direction', () => {
		expect({
			askForRead: rules.effective({ kind: 'chosen', choice: 'ask' }, hints(true)),
			allowWrite: rules.effective({ kind: 'chosen', choice: 'allow' }, hints(false)),
			off: rules.effective({ kind: 'chosen', choice: 'off' }, hints(true))
		}).toEqual({ askForRead: 'ask', allowWrite: 'allow', off: 'off' });
	});
});
