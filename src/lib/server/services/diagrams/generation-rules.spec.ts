import { expect, it } from 'vitest';
import { DiagramGenerationRuleService } from './generation-rules';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
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
