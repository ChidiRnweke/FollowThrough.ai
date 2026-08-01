import { invalidateAll } from '$app/navigation';

const toolToDomain: Record<string, (() => void) | undefined> = {
	create_project: invalidateAll,
	rename_project: invalidateAll,
	archive_project: invalidateAll,
	create_folder: invalidateAll,
	move_project_entry: invalidateAll,
	create_note: invalidateAll,
	save_note: invalidateAll,
	edit_note: invalidateAll,
	publish_note: invalidateAll,
	discard_note_draft: invalidateAll,
	rename_note: invalidateAll,
	archive_note: invalidateAll,
	create_todo: invalidateAll,
	update_todo: invalidateAll,
	accept_suggestion: invalidateAll,
	reject_suggestion: invalidateAll,
	revert_suggestion: invalidateAll,
	create_skill: invalidateAll,
	create_skill_from_selection: invalidateAll,
	restore_skill_version: invalidateAll,
	propose_memory_change: invalidateAll,
	update_trust_policy: invalidateAll,
	update_agent_preferences: invalidateAll,
	generate_mermaid_diagram: invalidateAll,
	revise_mermaid_diagram: invalidateAll,
	promote_diagram: invalidateAll,
	initiate_template_upload: invalidateAll,
	generate_document: invalidateAll,
	delete_template: invalidateAll,
	delete_artifact: invalidateAll,
	regenerate_artifact: invalidateAll
};

export function refreshStale(resources: readonly string[]): void {
	for (const resource of resources) {
		const refresh = toolToDomain[resource];
		if (refresh) refresh();
	}
}
