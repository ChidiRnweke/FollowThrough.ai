/* eslint-disable @typescript-eslint/no-explicit-any -- projections cover heterogeneous capability outputs */
import { describe, expect, it } from 'vitest';
import type { ActorContext, TextSelection } from '../models';
import { createUnimplementedCapability, demoIds, demoNote, demoSuggestion } from '../factories';
import type {
	LinkFinder,
	MermaidDiagramCreator,
	PromiseExtractor,
	ReferenceFinder,
	SourceAnchorRepairer,
	SuggestionAccepter,
	SuggestionReverter,
	TrustPolicyEvaluator
} from './index';

const actor: ActorContext = { userId: demoIds.user };
const selection = (text: string): TextSelection => ({
	noteId: demoIds.note,
	revision: 1,
	from: 0,
	to: text.length,
	text
});
interface Case {
	name: string;
	run: () => Promise<unknown>;
	read: (value: any) => unknown;
	expected: unknown;
}
function contracts(name: string, cases: readonly Case[]) {
	describe(name, () => {
		it.each(cases)('$name', async ({ run, read, expected }) => {
			await expect(run().then(read)).resolves.toEqual(expected);
		});
	});
}

const promises = createUnimplementedCapability<PromiseExtractor>('PromiseExtractor');
contracts('PromiseExtractor contract', [
	{
		name: 'extracts explicit promises',
		run: () => promises.extract(actor, selection('I promise to send it.')),
		read: (v) => v[0].strength,
		expected: 'explicit'
	},
	{
		name: 'extracts implied promises',
		run: () => promises.extract(actor, selection('I should send it.')),
		read: (v) => v[0].strength,
		expected: 'implied'
	},
	{
		name: 'extracts tentative promises',
		run: () => promises.extract(actor, selection('I might send it.')),
		read: (v) => v[0].strength,
		expected: 'tentative'
	},
	{
		name: 'separates owner from action',
		run: () => promises.extract(actor, selection('Jan will send the API spec.')),
		read: (v) => ({ owner: v[0].ownerName, action: v[0].action }),
		expected: { owner: 'Jan', action: 'Send the API spec' }
	},
	{
		name: 'keeps verbatim dates',
		run: () => promises.extract(actor, selection('I will send it by end of next week.')),
		read: (v) => v[0].dueDateVerbatim,
		expected: 'by end of next week'
	},
	{
		name: 'excludes questions',
		run: () => promises.extract(actor, selection('Will Jan send it?')),
		read: (v) => v,
		expected: []
	},
	{
		name: 'excludes options',
		run: () => promises.extract(actor, selection('We could send it.')),
		read: (v) => v,
		expected: []
	}
]);

const links = createUnimplementedCapability<LinkFinder>('LinkFinder');
contracts('LinkFinder contract', [
	{
		name: 'returns closed relationship labels',
		run: () => links.find(actor, selection('Use OAuth.')),
		read: (v) =>
			v.every((x: any) =>
				[
					'same_client',
					'same_system',
					'prior_decision',
					'contradicts',
					'elaborates',
					'mentions'
				].includes(x.kind)
			),
		expected: true
	},
	{
		name: 'surfaces contradictions first',
		run: () => links.find(actor, selection('Do not use OAuth.')),
		read: (v) => v[0].kind,
		expected: 'contradicts'
	},
	{
		name: 'includes a justification',
		run: () => links.find(actor, selection('Use OAuth.')),
		read: (v) => typeof v[0].justification,
		expected: 'string'
	},
	{
		name: 'excludes self links',
		run: () => links.find(actor, selection('Use OAuth.')),
		read: (v) => v.some((x: any) => x.targetNoteId === demoIds.note),
		expected: false
	},
	{
		name: 'returns an honest empty result',
		run: () => links.find(actor, selection('Scratch text.')),
		read: (v) => v,
		expected: []
	}
]);

const references = createUnimplementedCapability<ReferenceFinder>('ReferenceFinder');
contracts('ReferenceFinder contract', [
	{
		name: 'returns official sources',
		run: () => references.find(actor, selection('OAuth.')),
		read: (v) => v.some((x: any) => x.tier === 'official'),
		expected: true
	},
	{
		name: 'attaches relevance notes',
		run: () => references.find(actor, selection('OAuth.')),
		read: (v) => v.every((x: any) => x.relevanceNote.length > 0),
		expected: true
	},
	{
		name: 'does not pad weak results',
		run: () => references.find(actor, selection('Scratch text.')),
		read: (v) => v,
		expected: []
	},
	{
		name: 'deduplicates canonical URLs',
		run: () => references.find(actor, selection('OAuth.')),
		read: (v) => new Set(v.map((x: any) => x.url)).size,
		expected: 3
	}
]);

const trust = createUnimplementedCapability<TrustPolicyEvaluator>('TrustPolicyEvaluator');
contracts('TrustPolicyEvaluator contract', [
	{
		name: 'accepts confidence at the threshold',
		run: () => trust.shouldAutoAccept(actor, 'extract_promises', demoSuggestion),
		read: (v) => v,
		expected: true
	},
	{
		name: 'rejects confidence below the threshold',
		run: () =>
			trust.shouldAutoAccept(actor, 'extract_promises', {
				...demoSuggestion,
				confidence: 49 as never
			}),
		read: (v) => v,
		expected: false
	},
	{
		name: 'rejects disabled policies',
		run: () => trust.shouldAutoAccept(actor, 'relate', demoSuggestion),
		read: (v) => v,
		expected: false
	},
	{
		name: 'never auto-accepts references',
		run: () => trust.shouldAutoAccept(actor, 'reference', demoSuggestion),
		read: (v) => v,
		expected: false
	}
]);

const anchors = createUnimplementedCapability<SourceAnchorRepairer>('SourceAnchorRepairer');
contracts('SourceAnchorRepairer contract', [
	{
		name: 'preserves anchors when text is unchanged',
		run: () => anchors.repairForNote(actor, demoNote),
		read: (v) => v[0].id,
		expected: demoIds.anchor
	},
	{
		name: 'moves anchors with shifted text',
		run: () =>
			anchors.repairForNote(actor, { ...demoNote, plainText: `Prefix ${demoNote.plainText}` }),
		read: (v) => v[0].from,
		expected: 7
	},
	{
		name: 'marks deleted source as unresolved',
		run: () => anchors.repairForNote(actor, { ...demoNote, plainText: '' }),
		read: (v) => v,
		expected: []
	},
	{
		name: 'does not guess between ambiguous quotes',
		run: () =>
			anchors.repairForNote(actor, {
				...demoNote,
				plainText: `${demoNote.plainText} ${demoNote.plainText}`
			}),
		read: (v) => v,
		expected: []
	}
]);

const mermaid = createUnimplementedCapability<MermaidDiagramCreator>('MermaidDiagramCreator');
contracts('MermaidDiagramCreator contract', [
	{
		name: 'returns Mermaid source',
		run: () => mermaid.create(actor, selection('A calls B.')),
		read: (v) => v.source,
		expected: 'sequenceDiagram\nA->>B: call'
	},
	{
		name: 'uses the requested diagram refinement',
		run: () => mermaid.create(actor, selection('A calls B.'), 'include errors'),
		read: (v) => v.source.includes('error'),
		expected: true
	}
]);

const accepter = createUnimplementedCapability<SuggestionAccepter>('SuggestionAccepter');
const reverter = createUnimplementedCapability<SuggestionReverter>('SuggestionReverter');
contracts('Suggestion lifecycle service contracts', [
	{
		name: 'accepts a proposed suggestion',
		run: () => accepter.accept(actor, demoSuggestion, demoIds.todo, false),
		read: (v) => v.status,
		expected: 'accepted'
	},
	{
		name: 'records automatic acceptance',
		run: () => accepter.accept(actor, demoSuggestion, demoIds.todo, true),
		read: (v) => v.isAutoAccepted,
		expected: true
	},
	{
		name: 'reverts an accepted suggestion',
		run: () =>
			reverter.revert(actor, {
				...demoSuggestion,
				status: 'accepted',
				appliedArtifactId: demoIds.todo
			}),
		read: (v) => v.status,
		expected: 'reverted'
	}
]);
