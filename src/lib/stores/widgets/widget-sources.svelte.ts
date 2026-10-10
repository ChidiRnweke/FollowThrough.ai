import { WidgetSourceService } from '$lib/services/widgets/sources';
const widgetSourcesRule = new WidgetSourceService();
import type { Widget, WidgetSources } from '$lib/models/widgets';

import { todayLocalDate } from '$lib/client/todos/local-date';
import { workspaceSession } from '$lib/factories/workspace/session';

/**
 * The rows a widget's sources show on this device, from the synced workspace. Read inside a
 * template or `$derived`, it follows every todo and note change, offline included. Without a
 * loaded workspace the sources are unavailable rather than empty, so a dashboard never reads
 * "0 overdue" because nothing was loaded.
 */
export const widgetSources = (widget: Widget): WidgetSources => {
	if (!widget.layout.sources) return { kind: 'rows', rows: {} };
	const views = workspaceSession.current?.resources.views;
	if (!views) return { kind: 'unavailable' };
	return {
		kind: 'rows',
		rows: widgetSourcesRule.rows(widget.layout.sources, {
			projectId: widget.projectId,
			today: todayLocalDate(),
			todos: views.all('todos'),
			notes: views.all('notes')
		})
	};
};
