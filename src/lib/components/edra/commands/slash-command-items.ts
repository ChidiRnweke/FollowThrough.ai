import type { EdraCommand } from './commands.js';

/** One group of slash commands, as the list renders it. */
export interface SlashCommandGroup {
	readonly name: string;
	readonly title: string;
	readonly commands: EdraCommand[];
}

/**
 * Human titles for the command groups. Groups without one are not offered: the
 * `commands` map also holds toolbar-only clusters (alignment, colours) that mean
 * nothing as a standalone "insert this" choice.
 */
const GROUP_TITLES: Readonly<Record<string, string>> = {
	headings: 'Headings',
	lists: 'Lists',
	blocks: 'Blocks',
	media: 'Media',
	diagram: 'Diagrams',
	table: 'Table'
};

const matches = (command: EdraCommand, query: string): boolean => {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	return (
		command.name.toLowerCase().includes(needle) ||
		command.tooltip.toLowerCase().includes(needle) ||
		(command.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle))
	);
};

/**
 * The groups a `/` query offers, in a fixed order with empty groups dropped.
 *
 * Order is the map's own, not relevance-ranked: the list is short enough to scan,
 * and a stable order is what lets someone learn "slash, down, down, enter" as a
 * gesture rather than reading it every time.
 */
export const slashCommandGroups = (
	commands: Readonly<Record<string, EdraCommand[]>>,
	query: string
): SlashCommandGroup[] =>
	Object.entries(GROUP_TITLES)
		.map(([name, title]) => ({
			name,
			title,
			commands: (commands[name] ?? []).filter((command) => matches(command, query))
		}))
		.filter((group) => group.commands.length > 0);
