import { describe, expect, it } from 'vitest';
import { mxfile, vertex } from '$lib/testing/diagrams/fixtures/drawio';
import { DiagramSaveCoordinator } from './save-coordinator';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemoryDiagramSaveTransport } from '$lib/testing/diagrams/fakes/in-memory-diagram-save-transport';
import type { DrawioDiagram } from '$lib/models/diagrams';

const xml = (value: string): string => mxfile(vertex({ id: 'node', value }));

const setup = () => {
	const diagram = drawioBuilder({
		source: xml('base'),
		publishedRevision: 0,
		publishedAt: undefined
	});
	const transport = new InMemoryDiagramSaveTransport(diagram);
	const replacements: DrawioDiagram[] = [];
	const coordinator = new DiagramSaveCoordinator(
		diagram,
		transport,
		() => undefined,
		(value) => replacements.push(value)
	);
	return { diagram, transport, coordinator, replacements };
};

const paused = () => {
	let resume: () => void = () => {
		throw new Error('Pause not initialized');
	};
	const promise = new Promise<void>((resolve) => {
		resume = resolve;
	});
	return { promise, resume: () => resume() };
};

describe('Diagram save coordination (ADR 0010)', () => {
	it('keeps newer captured content dirty after an older acknowledgment', async () => {
		const { transport, coordinator } = setup();
		const gate = paused();
		transport.beforeWrite = () => gate.promise;
		const pending = coordinator.save(xml('saving'));
		coordinator.capture(xml('live'));
		gate.resume();
		await pending;
		expect(coordinator.snapshot.dirty).toBe(true);
	});
	it('keeps a live review capture when an earlier save acknowledgment arrives', async () => {
		const { transport, coordinator } = setup();
		const gate = paused();
		transport.beforeWrite = () => gate.promise;
		const pending = coordinator.save(xml('saving'));
		coordinator.capture(xml('live'));
		gate.resume();
		await pending;
		expect(coordinator.snapshot.local.source).toBe(xml('live'));
	});

	it('retries restoring from the history dialog after a connection failure', async () => {
		const { transport, coordinator } = setup();
		await coordinator.publish(xml('publication'), '<svg/>');
		await coordinator.save(xml('draft'));
		transport.failure = new Error('Offline');
		await coordinator.restore(transport.revisions[0]!.id);
		transport.failure = undefined;
		const result = await coordinator.restore(transport.revisions[0]!.id);
		expect(result).toEqual({ kind: 'saved' });
	});

	it('can discard local content after keeping it failed', async () => {
		const { diagram, transport, coordinator } = setup();
		const remote = { ...diagram, currentRevision: 2, source: xml('remote') };
		transport.diagram = remote;
		await coordinator.save(xml('local'));
		transport.failure = new Error('Offline');
		await coordinator.keepLocal();
		coordinator.useRemote(remote);
		expect(coordinator.snapshot).toMatchObject({
			local: remote,
			dirty: false,
			status: { kind: 'idle' }
		});
	});
	it('preserves the newest edit while an earlier save is pending', async () => {
		const { transport, coordinator } = setup();
		const gate = paused();
		transport.beforeWrite = () => gate.promise;
		const first = coordinator.save(xml('first'));
		const second = coordinator.save(xml('second'));
		gate.resume();
		await Promise.all([first, second]);
		expect(coordinator.snapshot.local.source).toBe(xml('second'));
	});

	it('uses acknowledged revisions for queued rename and publication', async () => {
		const { transport, coordinator } = setup();
		const writes = [
			coordinator.save(xml('draft')),
			coordinator.rename('Renamed'),
			coordinator.publish(xml('draft'), '<svg/>')
		];
		await Promise.all(writes);
		expect(transport.diagram).toMatchObject({
			title: 'Renamed',
			currentRevision: 3,
			publishedRevision: 3
		});
	});

	it('keeps edits after the publication capture as an unpublished draft', async () => {
		const { transport, coordinator } = setup();
		await Promise.all([
			coordinator.publish(xml('publication'), '<svg/>'),
			coordinator.save(xml('later'))
		]);
		expect(transport.diagram).toMatchObject({
			source: xml('later'),
			currentRevision: 3,
			publishedRevision: 2
		});
	});

	it('does not replace canvas content on autosave acknowledgment', async () => {
		const { coordinator, replacements } = setup();
		await coordinator.save(xml('draft'));
		expect(replacements).toEqual([]);
	});

	it('retains failed content and retries without a newer edit', async () => {
		const { transport, coordinator } = setup();
		transport.failure = new Error('Offline');
		await coordinator.save(xml('retained'));
		transport.failure = undefined;
		await coordinator.retry();
		expect(transport.diagram.source).toBe(xml('retained'));
	});

	it('retains newer content while a failed write is retried', async () => {
		const { transport, coordinator } = setup();
		transport.failure = new Error('Offline');
		await coordinator.save(xml('failed'));
		await coordinator.save(xml('newer'));
		transport.failure = undefined;
		await coordinator.retry();
		expect(transport.diagram.source).toBe(xml('newer'));
	});

	it('does not silently rebase dirty canvas content on a query refresh', async () => {
		const { diagram, transport, coordinator } = setup();
		coordinator.modified();
		transport.diagram = { ...diagram, currentRevision: 2, source: xml('remote') };
		coordinator.observe(transport.diagram);
		await coordinator.save(xml('local'));
		expect(coordinator.snapshot.status).toMatchObject({
			kind: 'conflict',
			base: diagram,
			remote: transport.diagram
		});
	});

	it('adopts a newer server document when the canvas is clean', () => {
		const { diagram, coordinator, replacements } = setup();
		const remote = { ...diagram, currentRevision: 2, source: xml('remote') };
		coordinator.observe(remote);
		expect(replacements).toEqual([remote]);
	});

	it('ignores an older query response after a successful save', async () => {
		const { diagram, coordinator } = setup();
		await coordinator.save(xml('new'));
		coordinator.observe(diagram);
		expect(coordinator.snapshot.diagram.source).toBe(xml('new'));
	});

	it('replaces the canvas with the reviewed remote version on use latest', async () => {
		const { diagram, transport, coordinator, replacements } = setup();
		transport.diagram = { ...diagram, currentRevision: 2, source: xml('remote') };
		await coordinator.save(xml('local'));
		coordinator.useRemote(transport.diagram);
		expect(replacements).toEqual([transport.diagram]);
	});

	it('keeps local content as a draft without publishing during resolution', async () => {
		const { diagram, transport, coordinator } = setup();
		transport.diagram = { ...diagram, currentRevision: 2, source: xml('remote') };
		await coordinator.publish(xml('local'), '<svg/>');
		await coordinator.keepLocal();
		expect(transport.diagram).toMatchObject({
			source: xml('local'),
			publishedRevision: 0
		});
	});

	it('reports another conflict if the remote changes during resolution', async () => {
		const { diagram, transport, coordinator } = setup();
		transport.diagram = { ...diagram, currentRevision: 2, source: xml('remote') };
		await coordinator.save(xml('local'));
		transport.diagram = {
			...transport.diagram,
			currentRevision: 3,
			source: xml('remote again')
		};
		const result = await coordinator.keepLocal();
		expect(result).toEqual({ kind: 'conflict' });
	});

	it('loads a restored version into the canvas as a new draft', async () => {
		const { transport, coordinator, replacements } = setup();
		await coordinator.publish(xml('publication'), '<svg/>');
		await coordinator.save(xml('later'));
		await coordinator.restore(transport.revisions[0]!.id);
		expect(replacements[0]).toMatchObject({
			source: xml('publication'),
			currentRevision: 4,
			publishedRevision: 2
		});
	});
});
