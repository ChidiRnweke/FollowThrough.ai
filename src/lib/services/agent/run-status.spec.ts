import { expect, it } from 'vitest';
import { isTerminalAgentRunStatus, isRunEventStreamComplete } from './run-status';

it.each(['completed', 'failed', 'cancelled'] as const)(
	'treats %s as terminal for retry and event-stream consumers',
	(status) => {
		expect(isTerminalAgentRunStatus(status)).toBe(true);
	}
);

it.each(['queued', 'running', 'awaiting_approval', 'cancelling'] as const)(
	'keeps %s open for further execution events',
	(status) => {
		expect(isTerminalAgentRunStatus(status)).toBe(false);
	}
);

it('keeps a terminal stream open until its unread tail is delivered without losing cursor precision', () => {
	expect(isRunEventStreamComplete('completed', '9007199254740992', '9007199254740993')).toBe(false);
});

it('closes a terminal stream once its durable tail is delivered', () => {
	expect(isRunEventStreamComplete('cancelled', '9007199254740993', '9007199254740993')).toBe(true);
});

it('keeps a running stream open even at its current tail', () => {
	expect(isRunEventStreamComplete('running', '3', '3')).toBe(false);
});
