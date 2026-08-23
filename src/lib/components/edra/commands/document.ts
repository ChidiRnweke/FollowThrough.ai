import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';
import { proseMirrorDocumentSchema, type ProseMirrorDocument } from '$lib/models/notes';

export type EdraDocument = ProseMirrorDocument;

export const parseEdraDocument = (value: unknown): EdraDocument =>
	proseMirrorDocumentSchema.parse(value);

const editorMarkSchema = z
	.object({
		type: z.string(),
		attrs: z.record(z.string(), z.unknown()).optional()
	})
	.strict();

const editorContentSchema: z.ZodType<JSONContent> = z.lazy(() =>
	z
		.object({
			type: z.string().optional(),
			attrs: z.record(z.string(), z.unknown()).optional(),
			content: z.array(editorContentSchema).optional(),
			marks: z.array(editorMarkSchema).optional(),
			text: z.string().optional()
		})
		.strict()
);

/** Copies the readonly domain document into TipTap's mutable protocol shape. */
export const editorContent = (document: EdraDocument): JSONContent =>
	editorContentSchema.parse(document);
