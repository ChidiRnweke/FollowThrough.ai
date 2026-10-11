import { expect, it } from 'vitest';
import { BUILT_INS, RETIRED_BUILT_INS } from './built-in-definitions';

const versionOf = (definition: { readonly version?: string }) => Number(definition.version ?? 0);

// An install is upgraded in place only when it still matches a retired release, so every
// retired release must belong to an active skill and precede that skill's current version.
it('keeps every retired release older than the active version of its skill', () => {
	const stale = RETIRED_BUILT_INS.filter((retired) => {
		const active = BUILT_INS.find((definition) => definition.key === retired.key);
		return !active || versionOf(retired) >= versionOf(active);
	});
	expect(stale.map((definition) => definition.key)).toEqual([]);
});
