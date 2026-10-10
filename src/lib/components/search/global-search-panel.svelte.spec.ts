import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteSearchContentMatch, NoteSearchHit } from '$lib/models/notes';
import { createGlobalSearch } from '$lib/factories/search/global-search';
import type { GlobalSearchController } from '$lib/controllers/search/global-search';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { noteBuilder, projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import GlobalSearchPanel from './global-search-panel.svelte';

let fixture: ReturnType<typeof workspaceResourcesFixture>;
let globalSearch: GlobalSearchController;
let version = 0n;
const seedResults = async (
	title = 'Release plan',
	text = 'we ship it ' + 'a'.repeat(130) + ' then ship'
): Promise<void> => {
	const note = noteBuilder({
		title,
		plainText: text,
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
		}
	});
	await fixture.cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(++version),
		value: { type: 'notes', value: note }
	});
	globalSearch.edit({ query: 'ship' });
	await globalSearch.search();
};
beforeEach(async () => {
	fixture = workspaceResourcesFixture(noteBuilder().userId);
	fixture.resources.setOnline(false);
	const project = projectBuilder();
	await fixture.cache.accept(workspaceResourceKey({ type: 'projects', id: [project.id] }), {
		etag: syncEtag(1n),
		value: { type: 'projects', value: project }
	});
	await fixture.resources.initialize();
	globalSearch = createGlobalSearch(() => fixture.resources, new InMemorySyncScheduler());
});
afterEach(() => fixture.resources.stop());

describe('The toolbar defines the search in two rows', () => {
	it('keeps the replace text field and project filter without a replace toggle', async () => {
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await expect.element(screen.getByPlaceholder('Replace with...')).toBeVisible();
	});
});

describe('Replace all asks before rewriting notes', () => {
	it('does not offer replacement when matches occur only in titles', async () => {
		await seedResults('ship release', '');
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await expect.element(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
	});
	it('opens a confirmation naming the blast radius', async () => {
		await seedResults('ship release');
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await screen.getByRole('button', { name: 'Replace all' }).click();
		await expect.element(screen.getByText('Replace 2 matches across 1 note?')).toBeVisible();
	});
});

describe('Result rows', () => {
	it('shows the match count and marks only truncated snippet windows', async () => {
		await seedResults();
		const screen = await render(GlobalSearchPanel, { globalSearch });
		expect(await screen.getByRole('button', { name: /…/ }).all()).toHaveLength(2);
	});

	it('reveals the selected match and preserves the complete hit for click-through', async () => {
		await seedResults();
		const opened: [NoteSearchHit, NoteSearchContentMatch][] = [];
		const screen = await render(GlobalSearchPanel, {
			globalSearch,
			onOpenMatch: (hit: NoteSearchHit, match: NoteSearchContentMatch) => {
				opened.push([hit, match]);
			}
		});
		await screen.getByRole('button', { name: /then ship/ }).click();
		await expect
			.poll(() => ({
				selectedStart: opened[0]?.[1].start,
				totalMatches: opened[0]?.[0].matches.length
			}))
			.toEqual({
				selectedStart: 147,
				totalMatches: 2
			});
	});

	it('jumps to the first match when the document title is clicked', async () => {
		await seedResults();
		const opened: [NoteSearchHit, NoteSearchContentMatch][] = [];
		const screen = await render(GlobalSearchPanel, {
			globalSearch,
			onOpenMatch: (hit: NoteSearchHit, match: NoteSearchContentMatch) => {
				opened.push([hit, match]);
			}
		});
		await screen.getByRole('button', { name: 'Release plan', exact: true }).click();
		expect(opened[0]?.[1].start).toBe(3);
	});
});

describe('While a refinement searches', () => {
	it('keeps the current results mounted rather than swapping them for the spinner', async () => {
		await seedResults();
		globalSearch.edit({ query: 'ship release' });
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await expect.element(screen.getByText('2 matches')).toBeVisible();
	});
});

describe('Empty states', () => {
	it('invites a search when nothing has been typed', async () => {
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await expect.element(screen.getByText("Search every note's title and text.")).toBeVisible();
	});

	it('says when a search found nothing', async () => {
		globalSearch.edit({ query: 'zeppelin' });
		await globalSearch.search();
		const screen = await render(GlobalSearchPanel, { globalSearch });
		await expect.element(screen.getByText('No results for “zeppelin”.')).toBeVisible();
	});
});

it('shows the project filter in the toolbar', async () => {
	const screen = await render(GlobalSearchPanel, { globalSearch });
	await expect.element(screen.getByText('All projects')).toBeVisible();
});
it('keeps the replace field available without a separate reveal toggle', async () => {
	const screen = await render(GlobalSearchPanel, { globalSearch });
	expect(await screen.getByRole('button', { name: 'Show replace' }).all()).toHaveLength(0);
});
it('opening the confirmation leaves durable notes unchanged', async () => {
	await seedResults();
	globalSearch.setReplacement('deploy');
	const screen = await render(GlobalSearchPanel, { globalSearch });
	await screen.getByRole('button', { name: 'Replace all' }).click();
	expect(fixture.resources.pending).toEqual([]);
});
