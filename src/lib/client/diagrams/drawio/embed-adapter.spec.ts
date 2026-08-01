import { describe, expect, it } from 'vitest';
import {
	DRAWIO_EMBED_ORIGIN,
	DrawioEmbedAdapter,
	type DrawioEmbedPort,
	type DrawioMessageEvent
} from './embed-adapter';

class FakeDrawioPort implements DrawioEmbedPort {
	readonly target = {};
	listener?: (event: DrawioMessageEvent) => void;
	posted: { message: Readonly<Record<string, unknown>>; origin: string }[] = [];
	cleanupCount = 0;

	frameWindow(): unknown {
		return this.target;
	}

	listen(listener: (event: DrawioMessageEvent) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
			this.cleanupCount += 1;
		};
	}

	post(message: string, origin: string): void {
		this.posted.push({ message: JSON.parse(message), origin });
	}

	emit(data: unknown, overrides: Partial<DrawioMessageEvent> = {}): void {
		this.listener?.({
			origin: DRAWIO_EMBED_ORIGIN,
			source: this.target,
			data: JSON.stringify(data),
			...overrides
		});
	}
}

const setup = () => {
	const port = new FakeDrawioPort();
	const exports: { xml: string; svg: string; reason: string }[] = [];
	const failures: string[] = [];
	const exits: boolean[] = [];
	const adapter = new DrawioEmbedAdapter(port, {
		onExport: (output) => exports.push(output),
		onFailure: (message) => failures.push(message),
		onExit: (modified) => exits.push(modified)
	});
	adapter.start({ xml: '<mxfile/>', title: 'Architecture' });
	return { adapter, port, exports, failures, exits };
};

describe('Safe draw.io iframe messaging invariants', () => {
	it('configures the hosted editor before initialization', () => {
		const { port } = setup();
		port.emit({ event: 'configure' });
		expect(port.posted[0]?.message.action).toBe('configure');
	});

	it('loads XML when the active iframe initializes', () => {
		const { port } = setup();
		port.emit({ event: 'init' });
		expect(port.posted[0]?.message.xml).toBe('<mxfile/>');
	});

	it('posts only to the exact hosted origin', () => {
		const { port } = setup();
		port.emit({ event: 'init' });
		expect(port.posted[0]?.origin).toBe(DRAWIO_EMBED_ORIGIN);
	});

	it('ignores messages from the wrong origin', () => {
		const { port } = setup();
		port.emit({ event: 'init' }, { origin: 'https://evil.example' });
		expect(port.posted).toEqual([]);
	});

	it('ignores messages from a stale iframe window', () => {
		const { port } = setup();
		port.emit({ event: 'init' }, { source: {} });
		expect(port.posted).toEqual([]);
	});

	it('ignores malformed JSON messages', () => {
		const { port } = setup();
		port.emit({ event: 'init' }, { data: '{' });
		expect(port.posted).toEqual([]);
	});

	it('exports review XML and SVG without persisting through the adapter', () => {
		const { adapter, port, exports } = setup();
		adapter.requestExport('review');
		port.emit({
			event: 'export',
			xml: '<mxfile><diagram/></mxfile>',
			data: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
		});
		expect(exports[0]?.reason).toBe('review');
	});

	it('exports the XML from an explicit editor save event', () => {
		const { port, exports } = setup();
		port.emit({ event: 'save', xml: '<mxfile><diagram/></mxfile>' });
		port.emit({
			event: 'export',
			data: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
		});
		expect(exports[0]?.xml).toBe('<mxfile><diagram/></mxfile>');
	});

	it('retains the adapter after export failure so the user can retry', () => {
		const { adapter, port } = setup();
		adapter.requestExport('save');
		port.emit({ event: 'export', xml: '<mxfile/>', data: 'not-a-data-uri' });
		expect(port.listener).toBeTypeOf('function');
	});

	it('reports protocol failures without discarding the working editor', () => {
		const { port, failures } = setup();
		port.emit({ event: 'load', error: 'Could not load diagram' });
		expect(failures).toEqual(['Could not load diagram']);
	});

	it('reloads the current XML when the user retries', () => {
		const { adapter, port } = setup();
		adapter.retry();
		expect(port.posted.at(-1)?.message.action).toBe('load');
	});

	it('reports editor exit with its modified state', () => {
		const { port, exits } = setup();
		port.emit({ event: 'exit', modified: true });
		expect(exits).toEqual([true]);
	});

	it('removes the message listener on teardown', () => {
		const { adapter, port } = setup();
		adapter.stop();
		expect(port.cleanupCount).toBe(1);
	});
});
