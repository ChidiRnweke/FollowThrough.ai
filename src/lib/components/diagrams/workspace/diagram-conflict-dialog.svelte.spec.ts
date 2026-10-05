import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { commands } from 'vitest/browser';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import DiagramConflictDialog from './diagram-conflict-dialog.svelte';

const waitForPreviewImage = (region: HTMLElement): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const existing = region.querySelector<HTMLImageElement>('img');
		if (existing) return resolve(existing);
		const observer = new MutationObserver(() => {
			const image = region.querySelector<HTMLImageElement>('img');
			if (!image) return;
			clearTimeout(timeout);
			observer.disconnect();
			resolve(image);
		});
		const timeout = setTimeout(() => {
			observer.disconnect();
			reject(new Error('Diagram preview did not render'));
		}, 2000);
		observer.observe(region, { childList: true, subtree: true });
	});

const props = () => ({
	open: true,
	record: {
		base: drawioBuilder({
			title: 'Base',
			source:
				'<mxfile><diagram id="base"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0" value="Base diagram"/></root></mxGraphModel></diagram></mxfile>'
		}),
		local: drawioBuilder({
			title: 'Local',
			source:
				'<mxfile><diagram id="local"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0" value="Local diagram"/></root></mxGraphModel></diagram></mxfile>'
		}),
		remote: {
			kind: 'found' as const,
			value: drawioBuilder({
				title: 'Remote',
				source:
					'<mxfile><diagram id="remote"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0" value="Remote diagram"/></root></mxGraphModel></diagram></mxfile>',
				currentRevision: 2
			})
		}
	},
	onUseRemote: async () => undefined,
	onKeepLocal: async () => undefined
});

describe('Diagram conflict review', () => {
	it('identifies all three documents for comparison', async () => {
		await commands.installDrawioProtocolFixture();
		const expected = [
			{
				label: 'Shared base',
				title: 'Base',
				svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>base</text></svg>'
			},
			{
				label: 'Your changes',
				title: 'Local',
				svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>local</text></svg>'
			},
			{
				label: 'Latest saved version',
				title: 'Remote',
				svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>remote</text></svg>'
			}
		];
		try {
			const choices: string[] = [];
			const input = props();
			input.onUseRemote = async () => {
				choices.push('remote');
			};
			input.onKeepLocal = async () => {
				choices.push('local');
			};
			const screen = render(DiagramConflictDialog, input);
			const evidence = [];
			for (const item of expected) {
				const region = [...document.querySelectorAll<HTMLElement>('section[aria-label]')].find(
					(candidate) => candidate.getAttribute('aria-label') === item.label
				);
				if (!region) throw new Error(`Missing ${item.label} comparison region`);
				const image = await waitForPreviewImage(region);
				const preview = await fetch(image.src).then((response) => response.text());
				evidence.push({
					label: item.label,
					title: image?.alt,
					preview
				});
			}
			await screen.getByRole('button', { name: 'Review later' }).click();
			expect({
				evidence,
				closed: screen.container.querySelector('[role="dialog"]') === null,
				choices
			}).toEqual({
				evidence: expected.map((item) => ({
					label: item.label,
					title: item.title,
					preview: item.svg
				})),
				closed: true,
				choices: []
			});
		} finally {
			await commands.removeDrawioProtocolFixture();
		}
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
