import { expect, it } from 'vitest';
import { DiagramGenerationRuleService } from './generation-rules';
import { mermaidBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testNow, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { DateTime } from '$lib/models/workspace';

it('rejects a newer write even when its source matches the generation base', () => {
	const base = mermaidBuilder();
	const current = { ...base, updatedAt: '2026-09-23T12:00:00.000Z' as DateTime };
	expect(() =>
		new DiagramGenerationRuleService().revision(
			current,
			base,
			{ source: 'flowchart LR\nA --> C', provenanceId: testProvenanceId() },
			testNow
		)
	).toThrow('The diagram changed while its revision was generated');
});

it('rejects a changed title even when the timestamp and source match', () => {
	const base = mermaidBuilder();
	expect(() =>
		new DiagramGenerationRuleService().revision(
			{ ...base, title: 'Peer title' },
			base,
			{ source: base.source, provenanceId: testProvenanceId() },
			testNow
		)
	).toThrow('The diagram changed while its revision was generated');
});

it('uses a submitted title with the generated source', () => {
	const base = mermaidBuilder();
	const draft = {
		source: 'flowchart LR\nA --> C',
		title: 'Revised system',
		provenanceId: testProvenanceId()
	};
	expect(new DiagramGenerationRuleService().revision(base, base, draft, testNow)).toMatchObject(
		draft
	);
});
