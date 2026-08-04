import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ValidationError } from '$lib/errors';
import { instrumentedController } from '$lib/server/controllers/instrumentation';

type RecordedEntry = { readonly level: string; readonly args: readonly unknown[] };

interface FakeControllerContract {
	get(actor: { readonly userId: string }, id: string): Promise<{ readonly id: string }>;
	domainFailure(): Promise<never>;
	bug(): Promise<never>;
	_helper(): Promise<string>;
}

class FakeController implements FakeControllerContract {
	constructor(private readonly greeting: string) {}

	async get(actor: { readonly userId: string }, id: string): Promise<{ readonly id: string }> {
		return { id: `${this.greeting}:${id}` };
	}

	async domainFailure(): Promise<never> {
		throw new ValidationError('name already taken');
	}

	async bug(): Promise<never> {
		throw new Error('database connection lost');
	}

	async _helper(): Promise<string> {
		return 'internal';
	}

	/** Mirrors `Agent.freezeInput`: a sync helper public methods call without `await`. */
	private freezeLike(input: string): string {
		return `frozen:${input}`;
	}

	async submitLike(input: string): Promise<string> {
		const frozen = this.freezeLike(input);
		return frozen;
	}

	syncThrower(): string {
		throw new ValidationError('sync domain failure');
	}
}

const recordingLogger = (entries: RecordedEntry[]) => ({
	info: (...args: unknown[]) => {
		entries.push({ level: 'info', args });
	},
	debug: (...args: unknown[]) => {
		entries.push({ level: 'debug', args });
	},
	warn: (...args: unknown[]) => {
		entries.push({ level: 'warn', args });
	},
	error: (...args: unknown[]) => {
		entries.push({ level: 'error', args });
	}
});

describe('instrumentedController', () => {
	let savedLogLevel: string | undefined;

	beforeEach(() => {
		savedLogLevel = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = 'debug';
	});

	afterEach(() => {
		if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
		else process.env.LOG_LEVEL = savedLogLevel;
	});

	test('logs info before the method body runs', async () => {
		const sequence: string[] = [];
		const controller = new FakeController('hello');
		const wrapped = instrumentedController('fake', controller, {
			...recordingLogger([]),
			info: () => {
				sequence.push('info');
			},
			debug: () => undefined
		});

		await wrapped.get({ userId: 'u1' }, 'n1').then(() => sequence.push('after'));

		expect(sequence[0]).toBe('info');
	});

	test('logs debug with a duration on success', async () => {
		const entries: RecordedEntry[] = [];
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger(entries)
		);

		await wrapped.get({ userId: 'u1' }, 'n1');

		expect(String(entries.find((entry) => entry.level === 'debug')?.args[0])).toMatch(
			/\[fake\] get completed in \d+ms/
		);
	});

	test('keeps the instance binding so methods see constructor state', async () => {
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger([])
		);

		const result = await wrapped.get({ userId: 'u1' }, 'n1');

		expect(result).toEqual({ id: 'hello:n1' });
	});

	test('rethrows domain failures', async () => {
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger([])
		);

		await expect(wrapped.domainFailure()).rejects.toBeInstanceOf(ValidationError);
	});

	test('logs domain failures as warnings, not errors', async () => {
		const entries: RecordedEntry[] = [];
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger(entries)
		);

		await wrapped.domainFailure().catch(() => undefined);

		expect(entries.some((entry) => entry.level === 'warn')).toBe(true);
	});

	test('logs unexpected failures as errors', async () => {
		const entries: RecordedEntry[] = [];
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger(entries)
		);

		await wrapped.bug().catch(() => undefined);

		expect(entries.some((entry) => entry.level === 'error' && entry.args[1] instanceof Error)).toBe(
			true
		);
	});

	test('does not wrap underscore-prefixed helpers', async () => {
		const entries: RecordedEntry[] = [];
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger(entries)
		);

		await wrapped._helper();

		expect(entries).toHaveLength(0);
	});

	test('passes synchronous methods through with their contract intact', () => {
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger([])
		);

		const result = (wrapped as unknown as { freezeLike(input: string): string }).freezeLike('note');

		expect(result).toBe('frozen:note');
	});

	test('keeps a synchronous throw synchronous instead of becoming a rejection', () => {
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger([])
		);

		expect(() => wrapped.syncThrower()).toThrow(ValidationError);
	});

	test('writes no log records for synchronous methods', () => {
		const entries: RecordedEntry[] = [];
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger(entries)
		);

		(wrapped as unknown as { freezeLike(input: string): string }).freezeLike('note');

		expect(entries).toHaveLength(0);
	});

	test('lets a public method use its synchronous helpers, as submit does freezeInput', async () => {
		const wrapped = instrumentedController(
			'fake',
			new FakeController('hello'),
			recordingLogger([])
		);

		expect(await wrapped.submitLike('note')).toBe('frozen:note');
	});
});
