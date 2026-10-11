import { expect, it } from 'vitest';
import { DiagramGenerationRuleService } from './generation-rules';
import { mermaidBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import {
	testNoteId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { DateTime } from '$lib/models/workspace';

it('rejects a rendered payload that is not a PNG', () => {
	expect(() =>
		new DiagramGenerationRuleService().validate({
			operation: 'revise',
			noteId: testNoteId(),
			source: 'flowchart LR',
			instruction: 'Revise',
			renderedPngDataUrl: 'data:image/png;base64,dGV4dA=='
		})
	).toThrow('valid PNG');
});

it('keeps a native-vision diagram model for rendered revisions', () => {
	expect(
		new DiagramGenerationRuleService().model('native/model', true, true, 'fallback/model')
	).toBe('native/model');
});

it('uses the fallback vision model for a text-only diagram model', () => {
	expect(
		new DiagramGenerationRuleService().model('text/model', false, true, 'fallback/model')
	).toBe('fallback/model');
});

it('keeps source-only repair on the configured model', () => {
	expect(
		new DiagramGenerationRuleService().model('text/model', false, false, 'fallback/model')
	).toBe('text/model');
});

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
