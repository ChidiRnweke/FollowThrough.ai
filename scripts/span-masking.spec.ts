import { expect, it } from 'vitest';
import {
	InMemorySpanExporter,
	BasicTracerProvider,
	SimpleSpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { withMaskedSpanAttributes } from './span-masking.js';

/** Exports one span carrying `attributes` through the masking exporter and returns what arrived. */
const exported = async (attributes: Record<string, string>) => {
	const exporter = new InMemorySpanExporter();
	const provider = new BasicTracerProvider({
		spanProcessors: [new SimpleSpanProcessor(withMaskedSpanAttributes(exporter))]
	});
	provider.getTracer('masking-test').startSpan('agent.turn', { attributes }).end();
	await provider.forceFlush();
	return exporter.getFinishedSpans()[0]?.attributes;
};

it('redacts MCP codes and tokens a prompt or tool payload carries before export', async () => {
	const attributes = await exported({
		'input.value': 'Connect with fta_Q2xhdWRlLXRva2Vu and refresh with ftr_Q29kZQ',
		'output.value': '{"location":"http://localhost:53122/callback?code=ftc_abc-DEF_123"}'
	});

	expect(attributes).toEqual({
		'input.value': 'Connect with fta_<redacted> and refresh with ftr_<redacted>',
		'output.value': '{"location":"http://localhost:53122/callback?code=ftc_<redacted>"}'
	});
});

it('elides a large inline image before export', async () => {
	const attributes = await exported({
		'input.value': `see data:image/png;base64,${'A'.repeat(4096)}`
	});

	expect(String(attributes?.['input.value'])).toContain('<base64 elided, 4118 chars>');
});
