import { z } from 'zod';

export const mermaidSubmissionSchema = z
	.object({
		title: z.string().trim().min(1).max(120).optional(),
		source: z.string().trim().min(1).max(50_000)
	})
	.strict();

export const drawioSubmissionSchema = z
	.object({
		title: z.string().trim().min(1).max(120),
		source: z.string().trim().min(1).max(2_000_000)
	})
	.strict();

export type DiagramSubmission =
	| ({ readonly kind: 'mermaid' } & z.infer<typeof mermaidSubmissionSchema>)
	| ({ readonly kind: 'drawio' } & z.infer<typeof drawioSubmissionSchema>);

export type DiagramSubmissionDecision =
	| { readonly kind: 'accepted'; readonly draft: DiagramSubmission }
	| { readonly kind: 'rejected'; readonly message: string };

export type DiagramGenerationEvent<ProviderEvent> =
	| { readonly kind: 'provider'; readonly event: ProviderEvent }
	| { readonly kind: 'submission'; readonly id: string; readonly draft: DiagramSubmission };

export interface DiagramGenerationRequest {
	readonly model: string;
	readonly operation: 'generate' | 'revise' | 'convert';
	readonly prompt: string;
	readonly instructions: string;
	readonly renderedPngDataUrl?: string;
}
