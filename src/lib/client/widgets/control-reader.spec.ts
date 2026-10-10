import { expect, it } from 'vitest';
import { readWidgetControlData } from './control-reader';

it('keeps saved controls and removes computed state from a vendor snapshot', () => {
	expect(readWidgetControlData({ n: 1, derived: { total: 2 }, sources: { todos: [] } })).toEqual({
		success: true,
		data: { n: 1 }
	});
});
