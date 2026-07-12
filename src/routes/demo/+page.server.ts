import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
	const shell = await factory.workspace().getShellContext(actor);
	const decisionNote = shell.noteTree.find((note) => note.title.includes('decision'));
	const [todos, suggestions, policies, noteView] = await Promise.all([
		factory.todos().list(actor, {}),
		factory.suggestions().list(actor, { status: 'proposed' }),
		factory.trustPolicies().list(actor),
		factory.notes().get(actor, { noteId: decisionNote?.id ?? shell.noteTree[0]!.id })
	]);
	return {
		todos: todos.todos,
		groups: suggestions.groups,
		policies: policies.policies,
		noteTree: shell.noteTree,
		noteView
	};
};
