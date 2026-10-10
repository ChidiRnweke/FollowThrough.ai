import type { WorkspaceSession } from '$lib/controllers/workspace/session';
import {
	SkillEditor,
	type SkillEditorController,
	type SkillEditorBuffer
} from '$lib/controllers/skills/editor';
import { SkillEditorStore } from '$lib/stores/skills/editor.svelte';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { BrowserSkillEditorFiles } from '$lib/client/skills/editor';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { createEditorSession } from '$lib/factories/workspace/editor-session';
import { workspaceSession } from '$lib/factories/workspace/session';
import type { WorkspaceSkill } from '$lib/models/workspace-views';
export function createSkillEditor(
	skill: WorkspaceSkill,
	session: WorkspaceSession,
	buffer: () => SkillEditorBuffer | undefined
): SkillEditorController {
	const draft = session.resources.draft({ type: 'notes', id: [skill.note.id] });
	const metadata = session.resources.draft({ type: 'skills', id: [skill.note.id] });
	return new SkillEditor(
		new SkillEditorStore(skill.note, skill.description),
		draft,
		metadata,
		createEditorSession(() => workspaceSession.current === session && draft.active),
		{
			get active() {
				return workspaceSession.current === session && session.resources.active;
			},
			synchronize: () => workspaceSession.synchronize(),
			skill: () => session.resources.views.skill(skill.note.id)
		},
		buffer,
		new SkillPortabilityService(),
		new BrowserSkillEditorFiles(),
		browserSyncScheduler
	);
}
