import { z } from 'zod';
import { ValidationError } from '$lib/errors';
import {
	drawioSubmissionSchema,
	mermaidSubmissionSchema,
	type DiagramSubmission
} from '$lib/models/diagrams/generation';

/** A submission the model sent, or a `ValidationError` naming what to correct. */
export const readDiagramSubmission = (
	value: unknown,
	kind: 'drawio' | 'mermaid'
): DiagramSubmission => {
	if (kind === 'drawio') {
		const parsed = drawioSubmissionSchema.safeParse(value);
		if (parsed.success) return { kind, ...parsed.data };
		throw new ValidationError(z.prettifyError(parsed.error));
	}
	const parsed = mermaidSubmissionSchema.safeParse(value);
	if (parsed.success) return { kind, ...parsed.data };
	throw new ValidationError(z.prettifyError(parsed.error));
};
