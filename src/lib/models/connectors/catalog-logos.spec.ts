import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONNECTOR_CATALOG } from './index';

describe('The connector catalog', () => {
	it('has a recorded logo for every entry, and none for an entry it no longer lists', () => {
		const recorded = readdirSync(new URL('../../../../static/connector-logos/', import.meta.url));
		expect(recorded.toSorted()).toEqual(
			CONNECTOR_CATALOG.map((entry) => entry.logo.file).toSorted()
		);
	});

	it('gives every entry a distinct id that can be a connector slug', () => {
		const ids = CONNECTOR_CATALOG.map((entry) => entry.id);
		expect({
			slugs: ids.filter((id) => !/^[a-z][a-z0-9]{0,15}$/.test(id)),
			duplicates: ids.filter((id, index) => ids.indexOf(id) !== index)
		}).toEqual({ slugs: [], duplicates: [] });
	});
});
