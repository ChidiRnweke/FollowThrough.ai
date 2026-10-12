import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { screenshotFile, screenshotIds, screenshotThemes } from './screenshots';

const folder = new URL('../../../../static/product-screenshots/', import.meta.url);

describe('product screenshots', () => {
	it('has a light and a dark capture of every screen the README, docs and marketing page show', () => {
		const missing = screenshotIds.flatMap((id) =>
			screenshotThemes
				.map((theme) => screenshotFile(id, theme))
				.filter((file) => !existsSync(new URL(file, folder)))
		);
		expect(missing).toEqual([]);
	});
});
