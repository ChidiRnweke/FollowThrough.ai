import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Insertion points for async actions that land in the document after a delay.
 *
 * The diagram action captures where its node should go at click time and inserts
 * it only when the agent run settles seconds later — long enough for the author to
 * keep typing. A raw ProseMirror position is meaningless against the document that
 * exists at completion, so this plugin holds each run's point and maps it through
 * every transaction in between, the same way `selection-action-plugin` maps its
 * wash. A point that ends up deleted or inside a replaced document is reported as
 * `'lost'`, and the caller falls back to the suggestion tray instead of inserting
 * into the wrong place.
 *
 * Set a point with `tr.setMeta(pendingInsertionsKey, { hold: { runId, position } })`
 * and drop it with `{ release: runId }`. Between the two, any document change maps
 * the held positions (a position inside deleted content becomes `'lost'`).
 */
export interface PendingInsertionPoints {
	readonly [runId: string]: number | 'lost';
}

type PendingInsertionsMeta =
	| { readonly hold: { readonly runId: string; readonly position: number } }
	| { readonly release: string };

export const pendingInsertionsKey = new PluginKey<PendingInsertionPoints>('pending-insertions');

export function createPendingInsertionsPlugin(): Plugin {
	return new Plugin<PendingInsertionPoints>({
		key: pendingInsertionsKey,
		state: {
			init: () => ({}),
			apply: (tr, previous) => {
				const meta = tr.getMeta(pendingInsertionsKey) as PendingInsertionsMeta | undefined;
				if (meta && 'hold' in meta) {
					return { ...previous, [meta.hold.runId]: meta.hold.position };
				}
				if (meta && 'release' in meta) {
					if (!(meta.release in previous)) return previous;
					const { [meta.release]: _released, ...rest } = previous;
					return rest;
				}
				if (!tr.docChanged) return previous;
				const mapped: Record<string, number | 'lost'> = {};
				for (const [runId, point] of Object.entries(previous)) {
					if (point === 'lost') {
						mapped[runId] = 'lost';
						continue;
					}
					const result = tr.mapping.mapResult(point);
					mapped[runId] = result.deleted ? 'lost' : result.pos;
				}
				return mapped;
			}
		}
	});
}

/** Where a run's insertion point is right now: `'lost'`, a number, or none. */
export function getPendingInsertion(
	state: EditorState,
	runId: string
): number | 'lost' | undefined {
	return pendingInsertionsKey.getState(state)?.[runId];
}

/** Marks `position` as the insertion spot for `runId` in `tr`'s resulting state. */
export function holdPendingInsertion(tr: Transaction, runId: string, position: number): Transaction {
	return tr.setMeta(pendingInsertionsKey, { hold: { runId, position } });
}

/** Stops tracking `runId`'s insertion point. */
export function releasePendingInsertion(tr: Transaction, runId: string): Transaction {
	return tr.setMeta(pendingInsertionsKey, { release: runId });
}
