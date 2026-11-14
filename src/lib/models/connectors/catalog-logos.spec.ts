import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONNECTOR_CATALOG } from './index';

describe('The connector catalog', () => {
	it('has a recorded logo for every entry, and none for an entry it no longer lists', () => {
		const recorded = readdirSync(new URL('../../../../static/connector-logos/', import.meta.url));
		expect(recorded.toSorted()).toEqual(
			CONNECTOR_CATALOG.map((entry) => `${entry.id}.svg`).toSorted()
		);
	});
});
