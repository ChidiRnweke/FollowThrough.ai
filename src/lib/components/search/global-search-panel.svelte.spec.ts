import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteId, NoteSearchContentMatch, NoteSearchHit } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { globalSearch } from '$lib/stores/search/global-search.svelte';
import GlobalSearchPanel from './global-search-panel.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75' as NoteId;

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
	it('has no replace toggle — the replace row is always there', async () => {
		const screen = await render(GlobalSearchPanel, {});
		expect(await screen.getByRole('button', { name: 'Show replace' }).all()).toHaveLength(0);
	});

	it('reads the replace field as a text input, not a button', async () => {
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByPlaceholder('Replace with...')).toBeVisible();
	});

	it('keeps the project filter beside the search field', async () => {
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByText('All projects')).toBeVisible();
	});
});

describe('Replace all asks before rewriting notes', () => {
	it('opens a confirmation naming the blast radius', async () => {
		seedResults();
		const screen = await render(GlobalSearchPanel, {});
		await screen.getByRole('button', { name: 'Replace all' }).click();
		await expect.element(screen.getByText('Replace 2 matches across 1 note?')).toBeVisible();
	});

	it('does not replace on the first click', async () => {
		seedResults();
		const screen = await render(GlobalSearchPanel, {});
		await screen.getByRole('button', { name: 'Replace all' }).click();
		expect(globalSearch.lastReplace).toBeUndefined();
	});
});

describe('Result rows', () => {
	it('states the match count in words next to the title', async () => {
		seedResults();
		const screen = await render(GlobalSearchPanel, {});
		await expect.element(screen.getByText('2 matches')).toBeVisible();
	});

	it('marks an ellipsis only where the window was actually cut', async () => {
		seedResults();
		const screen = await render(GlobalSearchPanel, {});
		expect(await screen.getByRole('button', { name: /…/ }).all()).toHaveLength(1);
	});

	it('requests a reveal for the clicked match', async () => {
		seedResults();
		const opened: [NoteId, NoteSearchContentMatch][] = [];
		const screen = await render(GlobalSearchPanel, {
			onOpenMatch: (noteId: NoteId, match: NoteSearchContentMatch) => {
				opened.push([noteId, match]);
			}
		});
		await screen.getByRole('button', { name: 'then ship' }).click();
		expect(opened[0]?.[1].start).toBe(20);
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
