import { describe, expect, it } from 'vitest';
import { aggregateVotes } from './consensus-aggregate';

const judge = (verdict: string): { verdict: string; reasoning: string } => ({
	verdict,
	reasoning: `reasoning for ${verdict}`
});

describe('aggregateVotes', () => {
	it('declares the pass verdict when every judge follows', () => {
		const verdict = aggregateVotes(['followed', 'followed', 'followed'].map(judge), 'followed');
		expect(verdict).toMatchObject({ followed: true, verdict: 'followed', agreement: 1, judges: 3 });
	});

	it('takes the majority when judges split', () => {
		const verdict = aggregateVotes(['followed', 'followed', 'violated'].map(judge), 'followed');
		expect(verdict).toMatchObject({
			followed: true,
			verdict: 'followed',
			agreement: 2 / 3,
			judges: 3,
			reasoning: 'reasoning for followed'
		});
	});

	it('reports the non-pass verdict when the majority does not follow', () => {
		const verdict = aggregateVotes(['violated', 'violated', 'followed'].map(judge), 'followed');
		expect(verdict).toMatchObject({ followed: false, verdict: 'violated', agreement: 2 / 3 });
	});

	it('reports a split instead of inventing a majority when tied', () => {
		const verdict = aggregateVotes(
			['followed', 'violated', 'not_applicable'].map(judge),
			'followed'
		);
		expect(verdict).toMatchObject({
			followed: false,
			verdict: 'split',
			agreement: 1 / 3,
			judges: 3
		});
	});
});
