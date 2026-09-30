import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
// Drop targets are positioned by utility classes, so hit-testing needs the real CSS.
import '../../../routes/layout.css';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import ProjectTreeDropFixture, { type TreeDrop } from './project-tree-drop.fixture.svelte';

const folder = noteBuilder({ id: testNoteId(1), kind: 'folder', title: 'Folder', position: 0 });
const inside = noteBuilder({ id: testNoteId(2), parentId: folder.id, title: 'Inside' });
const first = noteBuilder({ id: testNoteId(3), title: 'First', position: 1 });
const second = noteBuilder({ id: testNoteId(4), title: 'Second', position: 2 });
const third = noteBuilder({ id: testNoteId(5), title: 'Third', position: 3 });

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const centre = (element: Element) => {
	const rect = element.getBoundingClientRect();
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

type Point = { x: number; y: number };
// A target can leave the DOM once the shadow reaches it (an empty state gives
// way to the shadow row); the drag then keeps aiming where it last was.
type Aim = () => Point | undefined;

// svelte-dnd-action samples the pointer on an interval, so move gradually, stop
// when the target is reached, and let the zone settle before releasing.
async function dragTo(grip: Element, aim: Aim): Promise<void> {
	const start = centre(grip);
	let goal = start;
	const mouse = (type: string, at: { x: number; y: number }, on: EventTarget = window) =>
		on.dispatchEvent(
			new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y, button: 0 })
		);
	mouse('mousedown', start, grip);
	let at = start;
	for (let step = 0; step < 80; step++) {
		goal = aim() ?? goal;
		const dx = goal.x - at.x;
		const dy = goal.y - at.y;
		if (Math.abs(dx) < 2 && Math.abs(dy) < 3) break;
		at = { x: at.x + (goal.x - at.x) / 4, y: at.y + Math.sign(dy) * Math.min(Math.abs(dy), 3) };
		mouse('mousemove', at);
		await pause(30);
	}
	await pause(300);
	mouse('mouseup', at);
}

async function drop(
	notes: readonly NoteSummary[],
	openFolders: readonly NoteId[],
	dragged: string,
	target: (container: HTMLElement) => Aim
): Promise<TreeDrop[]> {
	const drops: TreeDrop[] = [];
	const finalized = Promise.withResolvers<void>();
	const screen = await render(ProjectTreeDropFixture, {
		projects: [projectBuilder()],
		notes,
		openFolders,
		ondrop: (received: TreeDrop) => {
			drops.push(received);
			finalized.resolve();
		}
	});
	await dragTo(screen.getByLabelText(`Reorder ${dragged}`).element(), target(screen.container));
	await finalized.promise;
	return drops;
}

const byText =
	(selector: string, text: string) =>
	(container: HTMLElement): Aim =>
	() => {
		const element = [...container.querySelectorAll(selector)].find(
			(candidate) => candidate.textContent?.trim() === text
		);
		return element && centre(element);
	};

it('moves a note dropped on a folder row into that folder', async () => {
	const drops = await drop(
		[folder, inside, first, second],
		[],
		'Second',
		byText('button[aria-expanded]', 'Folder')
	);
	expect(drops).toEqual([{ noteId: second.id, zone: `into:${folder.id}` }]);
});

it('accepts a drop anywhere on an empty folder create box', async () => {
	const drops = await drop(
		[folder, first, second],
		[folder.id],
		'Second',
		byText('button', 'Create your first note')
	);
	expect(drops).toEqual([{ noteId: second.id, zone: folder.id }]);
});

it('keeps a collapsed folder from catching drops aimed at the rows below it', async () => {
	// Aim once, where "First" sits before the drag starts: the rows shift under
	// the pointer as the shadow moves, and the point under test is fixed.
	const drops = await drop([folder, inside, first, second, third], [], 'Third', (container) => {
		const goal = byText('a', 'First')(container)();
		return () => goal;
	});
	expect(drops).toEqual([{ noteId: third.id, zone: 'root' }]);
});
