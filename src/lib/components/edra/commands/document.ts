import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';

interface EdraMark {
	readonly type: string;
	readonly attrs?: object;
}

export interface EdraNode {
	readonly type: string;
	readonly attrs?: object;
	readonly content?: readonly EdraNode[];
	readonly marks?: readonly EdraMark[];
	readonly text?: string;
}

export interface EdraDocument extends EdraNode {
	readonly type: 'doc';
}

const editorMarkSchema = z
	.object({
		type: z.string(),
		attrs: z.record(z.string(), z.json()).optional()
	})
	.strict();

const edraMarkSchema: z.ZodType<EdraMark> = editorMarkSchema;

const edraNodeSchema: z.ZodType<EdraNode> = z.lazy(() =>
	z
		.object({
			type: z.string(),
			attrs: z.record(z.string(), z.json()).optional(),
			content: z.array(edraNodeSchema).optional(),
			marks: z.array(edraMarkSchema).optional(),
			text: z.string().optional()
		})
		.strict()
);

const editorContentSchema: z.ZodType<JSONContent> = z.lazy(() =>
	z
		.object({
			type: z.string(),
			attrs: z.record(z.string(), z.json()).optional(),
			content: z.array(editorContentSchema).optional(),
			marks: z.array(editorMarkSchema).optional(),
			text: z.string().optional()
		})
		.strict()
);

const edraDocumentSchema: z.ZodType<EdraDocument> = z
	.object({
		type: z.literal('doc'),
		attrs: z.record(z.string(), z.json()).optional(),
		content: z.array(edraNodeSchema).optional(),
		marks: z.array(edraMarkSchema).optional(),
		text: z.string().optional()
	})
	.strict();

/** Parse an untrusted editor/Markdown value into Edra's product-agnostic protocol. */
export const parseEdraDocument = (value: unknown): EdraDocument => edraDocumentSchema.parse(value);

/** Copies the readonly domain document into TipTap's mutable protocol shape. */
export const editorContent = (document: object): JSONContent => editorContentSchema.parse(document);
