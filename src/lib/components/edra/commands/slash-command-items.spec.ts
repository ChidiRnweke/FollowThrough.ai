import { describe, expect, it } from 'vitest';
import type { EdraCommand } from './commands';
import { slashCommandGroups } from './slash-command-items';

const icon = (() => null) as unknown as EdraCommand['icon'];
const command = (name: string, tooltip: string, aliases?: string[]): EdraCommand => ({
	name,
	tooltip,
	icon,
	...(aliases ? { aliases } : {})
});

const map = {
	diagram: [
		command('mermaid', 'Mermaid Diagram'),
		command('drawio', 'Project diagram', ['drawio'])
	],
	lists: [command('bulletList', 'Bullet List')],
	// Toolbar-only cluster with no title: means nothing as an "insert this" choice.
	alignment: [command('left', 'Align Left')]
};

describe('Slash menu contents', () => {
	it('offers every titled group when nothing is typed', () => {
		expect(slashCommandGroups(map, '').map((group) => group.name)).toEqual(['lists', 'diagram']);
	});

	// The commands map also holds toolbar clusters; offering "Align Left" as a
	// thing to insert would be nonsense.
	it('leaves out groups that are not insertable', () => {
		expect(slashCommandGroups(map, '').some((group) => group.name === 'alignment')).toBe(false);
	});

	it('matches on a command name', () => {
		expect(
			slashCommandGroups(map, 'mermaid').flatMap((group) => group.commands.map((c) => c.name))
		).toEqual(['mermaid']);
	});

	it('matches on the human label rather than the internal name', () => {
		expect(
			slashCommandGroups(map, 'project').flatMap((group) => group.commands.map((c) => c.name))
		).toEqual(['drawio']);
	});

	it('matches on an alias, for a name a writer would not guess', () => {
		expect(
			slashCommandGroups(map, 'drawio').flatMap((group) => group.commands.map((c) => c.name))
		).toEqual(['drawio']);
	});

	it('drops a group whose commands all fail the query', () => {
		expect(slashCommandGroups(map, 'mermaid').map((group) => group.name)).toEqual(['diagram']);
	});

	it('offers nothing when the query matches nothing', () => {
		expect(slashCommandGroups(map, 'zzzz')).toEqual([]);
	});

	it('ignores case and surrounding space', () => {
		expect(
			slashCommandGroups(map, '  MERMAID ').flatMap((group) => group.commands.map((c) => c.name))
		).toEqual(['mermaid']);
	});
});
