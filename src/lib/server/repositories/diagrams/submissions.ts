import { z } from 'zod';
import {
	drawioSubmissionSchema,
	mermaidSubmissionSchema,
	type DiagramSubmission
} from '$lib/models/diagrams/generation';

export const readDiagramSubmission = (
	value: unknown,
	kind: 'drawio' | 'mermaid'
): DiagramSubmission =>
	kind === 'drawio'
		? { kind, ...drawioSubmissionSchema.parse(value) }
		: { kind, ...mermaidSubmissionSchema.parse(value) };

export const diagramSubmissionParameters = (kind: 'drawio' | 'mermaid') => {
	const schema = kind === 'drawio' ? drawioSubmissionSchema : mermaidSubmissionSchema;
	const converted = z.toJSONSchema(schema, { io: 'input' });
	if (
		converted.type !== 'object' ||
		converted.additionalProperties !== false ||
		typeof converted.properties !== 'object' ||
		converted.properties === null
	)
		throw new Error('Diagram submission parameters must convert to a strict object schema');
	return {
		type: 'object' as const,
		properties: converted.properties,
		required: Array.isArray(converted.required)
			? converted.required.filter((name): name is string => typeof name === 'string')
			: [],
		additionalProperties: false as const,
		...(converted.description ? { description: converted.description } : {})
	};
};
