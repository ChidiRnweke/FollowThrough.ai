import { Extension } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

/**
 * Keeps numbered lists continuously numbered when items disappear.
 *
 * A list carries a `start` attribute — how the numbering is written back to
 * Markdown (`3. c` stays a list that begins at 3) — and the browser renders
 * that list as-is. Two consequences follow:
 *
 * - Removing the first item of a list that starts above 1 leaves a gap
 *   (`3. c 4. d` minus the first item renders as `3. d`).
 * - Deleting the paragraph between two numbered lists leaves two adjacent
 *   lists, each numbering from its own start, instead of one continuous
 *   1..n sequence.
 *
 * This extension repairs both, but only when a deletion actually touched a
 * list: an edit elsewhere must not silently renumber a list that deliberately
 * starts at a non-1 number. Directly adjacent same-style ordered lists are
 * merged into one (the merged list numbers from 1), and a list that lost
 * items restarts at 1 unless it still directly continues a previous same-style
 * list.
 */

interface OrderedListInfo {
	readonly node: ProseMirrorNode;
	readonly pos: number;
	readonly end: number;
	readonly parent: ProseMirrorNode;
	readonly index: number;
}

interface RenumberOp {
	readonly kind: 'renumber';
	readonly pos: number;
	readonly attrs: Record<string, unknown>;
}

interface MergeOp {
	readonly kind: 'merge';
	readonly from: number;
	readonly to: number;
	readonly attrs: Record<string, unknown>;
}

type FixOp = RenumberOp | MergeOp;

export const OrderedListNumbering = Extension.create({
	name: 'orderedListNumbering',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				appendTransaction(transactions, oldState, newState) {
					// Renumbering reacts to content being removed. Without this gate
					// an insertion would reset a deliberately non-1 list as a side
					// effect of an unrelated edit.
					if (newState.doc.nodeSize >= oldState.doc.nodeSize) return null;

					// The positions where content was deleted, in the final doc.
					// Each step's `from` lives in its own transaction's before-state,
					// so it maps through that transaction and every one after it.
					const touch = new Set<number>();
					for (let i = 0; i < transactions.length; i += 1) {
						const tr = transactions[i];
						if (!tr.docChanged) continue;
						for (const step of tr.steps) {
							if (step.from === step.to) continue;
							let pos = tr.mapping.map(step.from);
							for (let j = i + 1; j < transactions.length; j += 1) {
								pos = transactions[j].mapping.map(pos);
							}
							touch.add(pos);
						}
					}
					if (touch.size === 0) return null;

					const { doc, schema } = newState;
					const orderedList = schema.nodes.orderedList;
					if (!orderedList) return null;

					const lists: OrderedListInfo[] = [];
					doc.descendants((node, pos) => {
						if (node.type === orderedList) {
							const $pos = doc.resolve(pos);
							lists.push({
								node,
								pos,
								end: pos + node.nodeSize,
								parent: $pos.parent,
								index: $pos.index()
							});
						}
						return true;
					});

					const sameStyle = (a: OrderedListInfo, b: OrderedListInfo): boolean =>
						a.node.attrs.type === b.node.attrs.type;

					// Document order makes adjacent siblings consecutive, so a run
					// is a maximal span whose parent and index line up.
					const runs: OrderedListInfo[][] = [];
					for (let i = 0; i < lists.length; ) {
						const run = [lists[i]];
						i += 1;
						while (
							i < lists.length &&
							lists[i].parent === run[0].parent &&
							lists[i].index === run[run.length - 1].index + 1 &&
							sameStyle(run[0], lists[i])
						) {
							run.push(lists[i]);
							i += 1;
						}
						runs.push(run);
					}

					const touched = (list: OrderedListInfo): boolean =>
						[...touch].some((p) => p >= list.pos - 1 && p <= list.end);

					const fixes: FixOp[] = [];
					for (const run of runs) {
						const runTouched = run.some(touched);
						if (run.length > 1 && runTouched) {
							fixes.push({
								kind: 'merge',
								from: run[0].pos,
								to: run[run.length - 1].end,
								attrs: { ...run[0].node.attrs, start: 1 }
							});
							continue;
						}
						for (const list of run) {
							if (!touched(list)) continue;
							const prev =
								list.index > 0 ? list.parent.child(list.index - 1) : undefined;
							const start =
								prev &&
								prev.type === orderedList &&
								prev.attrs.type === list.node.attrs.type
									? (prev.attrs.start ?? 1) + prev.childCount
									: 1;
							if (list.node.attrs.start !== start) {
								fixes.push({
									kind: 'renumber',
									pos: list.pos,
									attrs: { ...list.node.attrs, start }
								});
							}
						}
					}
					if (fixes.length === 0) return null;

					const tr = newState.tr;
					// Renumbers first: setNodeMarkup preserves structure, so the
					// merges that follow can rebuild their node from the current
					// doc and keep the corrected starts.
					for (const fix of fixes) {
						if (fix.kind === 'renumber') {
							tr.setNodeMarkup(tr.mapping.map(fix.pos), null, fix.attrs);
						}
					}
					// Merges right-to-left so earlier positions stay valid.
					const merges = fixes
						.filter((fix) => fix.kind === 'merge')
						.sort((a, b) => b.from - a.from);
					for (const merge of merges) {
						const from = tr.mapping.map(merge.from);
						const to = tr.mapping.map(merge.to);
						const items: ProseMirrorNode[] = [];
						let pos = from;
						while (pos < to) {
							const node = tr.doc.nodeAt(pos);
							if (node && node.type === orderedList) {
								node.content.forEach((child) => items.push(child));
							}
							pos += node ? node.nodeSize : 1;
						}
						tr.replaceWith(from, to, orderedList.create(merge.attrs, Fragment.from(items)));
					}
					return tr;
				}
			})
		];
	}
});
