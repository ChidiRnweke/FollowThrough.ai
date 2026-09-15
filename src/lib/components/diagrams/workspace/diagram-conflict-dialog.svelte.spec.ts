import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import DiagramConflictDialog from './diagram-conflict-dialog.svelte';

const props = () => ({
	open: true,
	record: {
		base: drawioBuilder({ title: 'Base', source: '<mxfile/>' }),
		local: drawioBuilder({ title: 'Local', source: '<mxfile/>' }),
		remote: {
			kind: 'found' as const,
			value: drawioBuilder({ title: 'Remote', source: '<mxfile/>', currentRevision: 2 })
		}
	},
	onUseRemote: async () => undefined,
	onKeepLocal: async () => undefined
});

describe('Diagram conflict review', () => {
	it('identifies all three documents for comparison', async () => {
		const screen = render(DiagramConflictDialog, props());
		await expect
			.element(screen.getByRole('region', { name: 'Latest saved version' }))
			.toHaveTextContent('Remote');
		await screen.getByRole('button', { name: 'Review later' }).click();
	});

	it('keeps the conflict available when saving the local choice fails', async () => {
		const screen = render(DiagramConflictDialog, {
			...props(),
			onKeepLocal: async () => {
				throw new Error('Connection lost');
			}
		});
		await screen.getByRole('button', { name: 'Keep mine' }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent('Connection lost');
		await screen.getByRole('button', { name: 'Review later' }).click();
	});

	it('allows deferring review without choosing a document', async () => {
		const screen = render(DiagramConflictDialog, props());
		await screen.getByRole('button', { name: 'Review later' }).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});
});

it('keeps deleted server content distinct from an unavailable read', async () => {
	const input = props();
	const screen = render(DiagramConflictDialog, {
		...input,
		record: { ...input.record, remote: { kind: 'deleted' } }
	});
	await expect.element(screen.getByRole('button', { name: 'Keep mine' })).toBeDisabled();
	await screen.getByRole('button', { name: 'Review later' }).click();
});
