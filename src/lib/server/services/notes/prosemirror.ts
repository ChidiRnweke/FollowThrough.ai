import type { ProseMirrorDocument } from '$lib/models/notes';

export interface ProseMirrorVisitorContext {
	readonly node: Record<string, unknown>;
	readonly depth: number;
	readonly parentType?: string;
	readonly listItemIndex?: number;
}

export type ProseMirrorVisitor = (ctx: ProseMirrorVisitorContext) => void;

export interface ProseMirrorVisitors {
	heading?: ProseMirrorVisitor;
	paragraph?: ProseMirrorVisitor;
	bulletList?: ProseMirrorVisitor;
	orderedList?: ProseMirrorVisitor;
	listItem?: ProseMirrorVisitor;
	blockquote?: ProseMirrorVisitor;
	codeBlock?: ProseMirrorVisitor;
	horizontalRule?: ProseMirrorVisitor;
	image?: ProseMirrorVisitor;
	text?: ProseMirrorVisitor;
	hardBreak?: ProseMirrorVisitor;
	unknown?: ProseMirrorVisitor;
}

export interface TextNodeMark {
	readonly type: string;
	readonly attrs?: Record<string, unknown>;
}

export function getTextMarks(node: Record<string, unknown>): readonly TextNodeMark[] {
	return (node.marks as readonly TextNodeMark[] | undefined) ?? [];
}

export function isTextBold(node: Record<string, unknown>): boolean {
	return getTextMarks(node).some((m) => m.type === 'bold');
}

export function isTextItalic(node: Record<string, unknown>): boolean {
	return getTextMarks(node).some((m) => m.type === 'italic');
}

export function isTextCode(node: Record<string, unknown>): boolean {
	return getTextMarks(node).some((m) => m.type === 'code');
}

export function collectNodeText(node: Record<string, unknown>): string {
	if (node.type === 'text') return (node.text as string) ?? '';
	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	return content.map(collectNodeText).join('');
}

export function walkProseMirrorDoc(doc: ProseMirrorDocument, visitors: ProseMirrorVisitors): void {
	const content = (doc.content as Array<Record<string, unknown>> | undefined) ?? [];
	for (const node of content) {
		walkNode(node, visitors, 0);
	}
}

function walkNode(
	node: Record<string, unknown>,
	visitors: ProseMirrorVisitors,
	depth: number,
	parentType?: string,
	listItemIndex?: number
): void {
	const type = node.type as string;
	const ctx: ProseMirrorVisitorContext = { node, depth, parentType, listItemIndex };

	switch (type) {
		case 'heading':
			visitors.heading?.(ctx);
			break;
		case 'paragraph':
			visitors.paragraph?.(ctx);
			break;
		case 'bulletList':
			visitors.bulletList?.(ctx);
			break;
		case 'orderedList':
			visitors.orderedList?.(ctx);
			break;
		case 'listItem':
			visitors.listItem?.(ctx);
			break;
		case 'blockquote':
			visitors.blockquote?.(ctx);
			break;
		case 'codeBlock':
			visitors.codeBlock?.(ctx);
			break;
		case 'horizontalRule':
			visitors.horizontalRule?.(ctx);
			break;
		case 'image':
			visitors.image?.(ctx);
			break;
		case 'text':
			visitors.text?.(ctx);
			break;
		case 'hardBreak':
			visitors.hardBreak?.(ctx);
			break;
		default:
			visitors.unknown?.(ctx);
			break;
	}

	const content = (node.content as Array<Record<string, unknown>> | undefined) ?? [];
	for (let i = 0; i < content.length; i++) {
		walkNode(content[i], visitors, depth + 1, type, type === 'listItem' ? i : undefined);
	}
}
