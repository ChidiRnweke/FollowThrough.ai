import type {
	ProseMirrorDocument,
	ProseMirrorNode,
	OutlineSource,
	OutlineHeading,
	OutlineOffset
} from '$lib/models/notes';

/** The block's full text, descending into content so nested nodes count. */
const blockText = (block: ProseMirrorNode): string => {
	if (block.type === 'text') return block.text;
	let text = '';
	for (const child of 'content' in block ? (block.content ?? []) : []) text += blockText(child);
	return text;
};

/** Everything a changed-block decision is allowed to look at. */
const signature = (block: ProseMirrorNode): string => `${block.type}:${blockText(block)}`;

/** Headings deep enough to be worth a tick mark; beyond this the rail turns to noise. */
const DEEPEST_OUTLINE_LEVEL = 6;

const clampLevel = (level: number): number =>
	Math.min(Math.max(Math.trunc(level) || 1, 1), DEEPEST_OUTLINE_LEVEL);

export interface NoteDocumentPresentation {
	prepare(document: ProseMirrorDocument): ProseMirrorDocument;
	changedBlocks(previous: ProseMirrorDocument, next: ProseMirrorDocument): number[];
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[];
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined;
}
export class NoteDocumentPresentationService implements NoteDocumentPresentation {
	/** Unsupported stored blocks remain visible and copyable as JSON code blocks. */
	prepare(document: ProseMirrorDocument): ProseMirrorDocument {
		const convert = (node: ProseMirrorNode): ProseMirrorNode => {
			if (node.type === 'unknown')
				return {
					type: 'codeBlock',
					attrs: { language: 'json' },
					content: [{ type: 'text', text: JSON.stringify(node.raw, null, '\t') }]
				};
			if (!('content' in node) || !node.content) return node;
			return { ...node, content: node.content.map(convert) };
		};
		return { ...document, content: document.content?.map(convert) };
	}
	/** Index-aligned text/type comparison ignores parser-only formatting differences. */
	changedBlocks(previous: ProseMirrorDocument, next: ProseMirrorDocument): number[] {
		const before = previous.content ?? [];
		const after = next.content ?? [];
		const changed: number[] = [];
		for (const [index, block] of after.entries()) {
			const previousBlock = before[index];
			if (!previousBlock || signature(previousBlock) !== signature(block)) changed.push(index);
		}
		return changed;
	}
	/** Blank headings are still being authored and have no useful navigation label. */
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[] {
		return items.flatMap((item) => {
			const text = item.textContent.trim();
			if (!item.id || text.length === 0) return [];
			return [{ id: item.id, level: clampLevel(item.level), text }];
		});
	}
	/** The preamble belongs to the opening section until a later heading crosses the line. */
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined {
		let active = offsets[0]?.id;
		for (const { id, top } of offsets) {
			if (top > line) break;
			active = id;
		}
		return active;
	}
}
