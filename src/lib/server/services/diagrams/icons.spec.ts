import { describe, expect, it } from 'vitest';
import { IconifyIconSearch } from './icons';

/** A recording fetch: the repo's fakes stand in for collaborators, never a mock library. */
const respondWith = (body: string, status = 200) => {
	const calls: string[] = [];
	const fetchImpl = (async (url: URL | string) => {
		calls.push(String(url));
		return new Response(body, { status });
	}) as unknown as typeof fetch;
	return { calls, search: new IconifyIconSearch(fetchImpl) };
};

const icons = (...names: string[]) =>
	JSON.stringify({ icons: names, total: names.length, limit: 32, start: 0 });

describe('Finding a logo for a diagram', () => {
	it('returns the icon names the library matched', async () => {
		const { search } = respondWith(icons('logos:aws-s3'));
		expect((await search.search('aws'))[0]?.name).toBe('logos:aws-s3');

		expect((await search.search('aws'))[0]?.url).toBe(
			'https://api.iconify.design/logos/aws-s3.svg'
		);
	});

	// The URL is the whole point: draw.io renders it through `shape=image`, and the
	// XML validator permits it because it is https rather than a data URI.

	it('asks the library for what it was given', async () => {
		const { calls, search } = respondWith(icons());
		await search.search('kubernetes');
		expect(calls[0]).toContain('query=kubernetes');
	});

	it('uses the provider minimum page size', async () => {
		const { calls, search } = respondWith(icons());
		await search.search('azure', 12);
		expect(calls[0]).toContain('limit=32');
	});

	it('refuses a search with nothing to search for', async () => {
		const { search } = respondWith(icons());
		await expect(search.search('   ')).rejects.toThrow();
	});

	it('drops a name it cannot turn into a URL', async () => {
		const { search } = respondWith(icons('not-a-qualified-name'));
		expect(await search.search('aws')).toEqual([]);
	});

	it('drops a name carrying path characters', async () => {
		const { search } = respondWith(icons('logos:../../etc/passwd'));
		expect(await search.search('aws')).toEqual([]);
	});

	it('reports a library that answers with an error', async () => {
		const { search } = respondWith('', 503);
		await expect(search.search('aws')).rejects.toThrow('503');
	});

	it('reports a library that answers with nonsense', async () => {
		const { search } = respondWith('<html>nope</html>');
		await expect(search.search('aws')).rejects.toThrow('unreadable');
	});

	// Not `[]`: no icon list means the library did not answer the question, and
	// "found nothing" is a real answer this search gives when it found nothing.
	it('reports a response carrying no icon list', async () => {
		const { search } = respondWith(JSON.stringify({ total: 0 }));
		await expect(search.search('aws')).rejects.toThrow('unexpected search result');
	});

	it('reports an icon list holding something that is not a name', async () => {
		const { search } = respondWith(JSON.stringify({ icons: ['logos:aws-s3', 7] }));
		await expect(search.search('aws')).rejects.toThrow('unexpected search result');
	});

	it('accepts a response carrying fields it does not read', async () => {
		const { search } = respondWith(
			JSON.stringify({ icons: ['logos:aws-s3'], total: 1, limit: 32, start: 0, other: 'ignored' })
		);
		expect((await search.search('aws'))[0]?.name).toBe('logos:aws-s3');
	});

	it('reports an empty match as an empty list', async () => {
		const { search } = respondWith(icons());
		expect(await search.search('aws')).toEqual([]);
	});

	it('accepts complete responses beyond the former response ceiling', async () => {
		const { search } = respondWith(
			JSON.stringify({
				icons: ['a:b'],
				total: 1,
				limit: 32,
				start: 0,
				padding: 'x'.repeat(600_000)
			})
		);
		expect(await search.search('aws')).toEqual([
			{ name: 'a:b', url: 'https://api.iconify.design/a/b.svg' }
		]);
	});
});

it('returns at most twelve candidates from a larger provider page', async () => {
	const names = Array.from({ length: 32 }, (_, i) => `test:icon-${i}`);
	const { search } = respondWith(icons(...names));
	expect((await search.search('test', 12)).map((icon) => icon.name)).toEqual(names.slice(0, 12));
});
it.each([0, -1, 1.5, 13, 500])('rejects an invalid requested icon count %s', async (limit) => {
	const { search } = respondWith(icons());
	await expect(search.search('test', limit)).rejects.toThrow('between 1 and 12');
});
