import { Table as TiptapTable } from '@tiptap/extension-table';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Class set on a `.tableWrapper` whose table is wider than the wrapper's content box. */
export const tableOverflowClass = 'is-overflowing';

const tableOverflowKey = new PluginKey('tableOverflow');

const contentWidth = (wrapper: HTMLElement): number => {
	const style = getComputedStyle(wrapper);
	return wrapper.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
};

/**
 * Marks over-wide tables so the stylesheet can let them scroll. Scrolling turns
 * the wrapper into a scroll container, which traps sticky header cells, so the
 * stylesheet scrolls only the tables that need it and keeps sticky headers on
 * the rest. The table's width never depends on the class, so toggling it cannot
 * feed back into the measurement.
 */
const tableOverflowPlugin = () =>
	new Plugin({
		key: tableOverflowKey,
		view(view) {
			// Headless editors (server rendering, node specs) have no layout to measure.
			if (typeof ResizeObserver === 'undefined') return {};
			const observed = new Set<HTMLElement>();
			const measure = (wrapper: HTMLElement) => {
				const table = wrapper.querySelector(':scope > table');
				if (!(table instanceof HTMLElement)) return;
				// One pixel absorbs sub-pixel rounding between the two widths.
				const overflowing = table.offsetWidth > contentWidth(wrapper) + 1;
				wrapper.classList.toggle(tableOverflowClass, overflowing);
			};
			const observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const wrapper = entry.target.closest('.tableWrapper');
					if (wrapper instanceof HTMLElement) measure(wrapper);
				}
			});
			const sync = () => {
				const current = new Set(
					Array.from(view.dom.querySelectorAll<HTMLElement>('.tableWrapper'))
				);
				for (const wrapper of observed) {
					if (current.has(wrapper)) continue;
					observer.unobserve(wrapper);
					const table = wrapper.querySelector(':scope > table');
					if (table) observer.unobserve(table);
					observed.delete(wrapper);
				}
				for (const wrapper of current) {
					if (observed.has(wrapper)) continue;
					observed.add(wrapper);
					observer.observe(wrapper);
					const table = wrapper.querySelector(':scope > table');
					if (table) observer.observe(table);
				}
			};
			sync();
			return {
				update: sync,
				destroy: () => observer.disconnect()
			};
		}
	});

export const Table = TiptapTable.extend({
	addProseMirrorPlugins() {
		return [...(this.parent?.() ?? []), tableOverflowPlugin()];
	}
}).configure({
	resizable: true,
	lastColumnResizable: true,
	allowTableNodeSelection: true
});

export default Table;
