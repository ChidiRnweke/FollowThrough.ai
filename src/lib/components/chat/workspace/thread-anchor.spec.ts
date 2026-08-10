import { describe, expect, it } from 'vitest';
import { anchorSpacerHeight } from './thread-anchor';

describe('The newest question can reach the top of the scroll port', () => {
	it('reserves whatever the last turn leaves uncovered', () => {
		expect(anchorSpacerHeight({ viewportHeight: 600, stackHeight: 500, questionOffset: 400 })).toBe(
			500
		);
	});

	it('reserves the whole port for the first question, which starts the stack', () => {
		expect(anchorSpacerHeight({ viewportHeight: 600, stackHeight: 80, questionOffset: 0 })).toBe(
			520
		);
	});

	it('collapses once the answer alone outgrows the port, so the thread scrolls normally', () => {
		expect(
			anchorSpacerHeight({ viewportHeight: 600, stackHeight: 2000, questionOffset: 900 })
		).toBe(0);
	});

	it('never reserves a negative height when the turn exactly fills the port', () => {
		expect(
			anchorSpacerHeight({ viewportHeight: 600, stackHeight: 1000, questionOffset: 400 })
		).toBe(0);
	});
});
