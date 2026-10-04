import type { Widget } from '$lib/models/widgets';
import type { DateTime } from '$lib/models/workspace';

export type WidgetTrashAction = 'archive' | 'restore' | 'delete';

/** A widget moves to the trash once, comes back once, and is deleted only from the trash. */
export function decideWidgetTrash(
	action: WidgetTrashAction,
	current: Pick<Widget, 'archivedAt'>
): { kind: 'allowed' } | { kind: 'invalid'; message: string } {
	if (action === 'archive' ? Boolean(current.archivedAt) : !current.archivedAt)
		return {
			kind: 'invalid',
			message:
				action === 'archive'
					? 'The widget is already in the trash'
					: 'The widget is not in the trash'
		};
	return { kind: 'allowed' };
}

/** The widget after it moves to or from the trash. Its layout and data are kept as they are. */
export function widgetTrashChange(
	action: 'archive' | 'restore',
	current: Widget,
	timestamp: DateTime
): { kind: 'invalid'; message: string } | { kind: 'change'; widget: Widget } {
	const decision = decideWidgetTrash(action, current);
	if (decision.kind === 'invalid') return decision;
	const { archivedAt, ...rest } = current;
	void archivedAt;
	return {
		kind: 'change',
		widget: {
			...rest,
			updatedAt: timestamp,
			...(action === 'archive' ? { archivedAt: timestamp } : {})
		}
	};
}
