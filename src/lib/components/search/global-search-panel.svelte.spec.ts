import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteSearchContentMatch, NoteSearchHit } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { globalSearch } from '$lib/stores/search/global-search.svelte';
import GlobalSearchPanel from './global-search-panel.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75' as NoteSearchHit['noteId'];

const hit: NoteSearchHit = {
	noteId: NOTE_ID,
	projectId: 'project-1' as ProjectId,
	title: 'Release plan',
	titleMatches: [],
	matches: [
		{
			start: 4,
			end: 8,
			text: 'ship',
			snippet: {
				before: 'we ',
				hit: 'ship',
				after: ' it',
				truncatedBefore: true,
				truncatedAfter: true
			}
		},
		{
			start: 20,
			end: 24,
			text: 'ship',
			snippet: {
				before: 'then ',
				hit: 'ship',
				after: '',
				truncatedBefore: false,
				truncatedAfter: false
			}
		}
	]
};

const seedResults = (): void => {
	globalSearch.query = 'ship';
	globalSearch.hits = [hit];
};

beforeEach(() => {
	globalSearch.query = '';
	globalSearch.replacement = '';
	globalSearch.regex = false;
	globalSearch.caseSensitive = false;
	globalSearch.projectId = undefined;
	globalSearch.hits = [];
	globalSearch.searching = false;
	globalSearch.searchError = undefined;
	globalSearch.lastReplace = undefined;
	globalSearch.collapsedNoteIds.clear();
});

describe('The toolbar defines the search in two rows', () => {
	it('keeps the replace text field and project filter without a replace toggle', async () => {
		const screen = await render(GlobalSearchPanel, {});
		expect({
			replaceField: (await screen.getByPlaceholder('Replace with...').all()).length,
			projectFilter: (await screen.getByText('All projects').all()).length,
			replaceToggle: (await screen.getByRole('button', { name: 'Show replace' }).all()).length
		}).toEqual({ replaceField: 1, projectFilter: 1, replaceToggle: 0 });
	});
});

describe('Replace all asks before rewriting notes', () => {
	it('does not offer replacement when matches occur only in titles', async () => {
		seedResults();
		globalSearch.hits = [
			{ ...hit, matches: [], titleMatches: [{ start: 0, end: 4, text: 'ship' }] }
		];
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
	});
	it('opens a confirmation naming the blast radius', async () => {
		seedResults();
		globalSearch.hits = [{ ...hit, titleMatches: [{ start: 0, end: 4, text: 'ship' }] }];
		const screen = await render(GlobalSearchPanel, {});
		await screen.getByRole('button', { name: 'Replace all' }).click();
		expect({
			confirmation: (await screen.getByText('Replace 2 matches across 1 note?').all()).length,
			replacement: globalSearch.lastReplace
		}).toEqual({ confirmation: 1, replacement: undefined });
	});
});

describe('Result rows', () => {
	it('shows the match count and marks only truncated snippet windows', async () => {
		seedResults();
		const screen = await render(GlobalSearchPanel, {});
		expect({
			count: (await screen.getByText('2 matches').all()).length,
			truncatedButtons: (await screen.getByRole('button', { name: /…/ }).all()).length
		}).toEqual({ count: 1, truncatedButtons: 1 });
	});

	it('reveals the selected match and preserves the complete hit for click-through', async () => {
		seedResults();
		const opened: [NoteSearchHit, NoteSearchContentMatch][] = [];
		const screen = await render(GlobalSearchPanel, {
			onOpenMatch: (hit: NoteSearchHit, match: NoteSearchContentMatch) => {
				opened.push([hit, match]);
			}
		});
		await screen.getByRole('button', { name: 'then ship' }).click();
		expect({
			selectedStart: opened[0]?.[1].start,
			totalMatches: opened[0]?.[0].matches.length
		}).toEqual({
			selectedStart: 20,
			totalMatches: 2
		});
	});

	it('jumps to the first match when the document title is clicked', async () => {
		seedResults();
		const opened: [NoteSearchHit, NoteSearchContentMatch][] = [];
		const screen = await render(GlobalSearchPanel, {
			onOpenMatch: (hit: NoteSearchHit, match: NoteSearchContentMatch) => {
				opened.push([hit, match]);
			}
		});
		await screen.getByRole('button', { name: 'Release plan', exact: true }).click();
		expect(opened[0]?.[1].start).toBe(4);
	});
});

describe('While a refinement searches', () => {
	it('keeps the current results mounted rather than swapping them for the spinner', async () => {
		seedResults();
		globalSearch.searching = true;
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByText('2 matches')).toBeVisible();
	});
});

describe('Empty states', () => {
	it('invites a search when nothing has been typed', async () => {
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByText("Search every note's title and text.")).toBeVisible();
	});

	it('says when a search found nothing', async () => {
		globalSearch.query = 'zeppelin';
		globalSearch.hits = [];
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByText('No results for “zeppelin”.')).toBeVisible();
	});
});
