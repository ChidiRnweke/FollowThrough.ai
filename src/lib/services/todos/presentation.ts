import type { Todo, TodoView, TodoContext } from '$lib/models/todos';

/** A linked note supplies the task's display source; its extraction origin stays visible separately. */
export function assembleTodoView(todo: Todo, facts: Omit<TodoContext, 'todo'>): TodoView {
	const source = facts.linked ?? facts.origin;
	return {
		todo,
		...(source ? { sourceNote: { id: source.id, title: source.title } } : {}),
		...(facts.origin ? { originNote: { id: facts.origin.id, title: facts.origin.title } } : {}),
		...(facts.anchor ? { anchor: facts.anchor } : {}),
		...(facts.provenance ? { provenance: facts.provenance } : {})
	};
}
