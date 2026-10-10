import { expect, it } from 'vitest';
import { SkillEditor, type SkillEditorBuffer } from './editor';
import { SkillEditorStore } from '$lib/stores/skills/editor.svelte';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { createEditorSession } from '$lib/factories/workspace/editor-session';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { InMemorySkillEditorFiles } from '$lib/testing/skills/fakes/editor-files';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import type { SessionSynchronization } from '$lib/controllers/workspace/session';
import type { WorkspaceValues } from '$lib/models/workspace-records';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = async () => {
	const note = noteBuilder({ kind: 'skill', title: 'Review', plainText: 'Review all findings.' });
	const details: WorkspaceValues['skills'] = {
		noteId: note.id,
		name: note.title,
		slug: 'review',
		description: 'Review findings',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt
	};
	const { resources, cache } = workspaceResourcesFixture(note.userId);
	resources.setOnline(false);
	await cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	await cache.accept(workspaceResourceKey({ type: 'skills', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'skills', value: details }
	});
	await resources.initialize();
	const buffer: { value: SkillEditorBuffer } = {
		value: { document: note.document, plainText: note.plainText, description: details.description }
	};
	const files = new InMemorySkillEditorFiles();
	const scheduler = new InMemorySyncScheduler();
	const synchronized = Promise.withResolvers<void>();
	const synchronization: { result: SessionSynchronization; wait: Promise<void> } = {
		result: { kind: 'complete' },
		wait: Promise.resolve()
	};
	const controller = new SkillEditor(
		new SkillEditorStore(note, details.description),
		resources.draft({ type: 'notes', id: [note.id] }),
		resources.draft({ type: 'skills', id: [note.id] }),
		createEditorSession(() => resources.active),
		{
			get active() {
				return resources.active;
			},
			async synchronize() {
				synchronized.resolve();
				await synchronization.wait;
				return synchronization.result;
			},
			skill: () => ({ ...details, note })
		},
		() => buffer.value,
		new SkillPortabilityService(),
		files,
		scheduler
	);
	controller.initialize();
	return {
		note,
		resources,
		buffer,
		files,
		scheduler,
		synchronization,
		synchronized: synchronized.promise,
		controller
	};
};
it('persists description and instructions offline before reporting the editor saved', async () => {
	const { controller, buffer, resources } = await setup();
	try {
		buffer.value = {
			description: 'Revised description',
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New instructions' }] }]
			},
			plainText: 'New instructions'
		};
		controller.changed();
		const result = await controller.save();
		expect({
			result,
			dirty: controller.dirty,
			description: controller.savedDescription,
			text: controller.note.plainText,
			commands: resources.pending.map((entry) => entry.intent.command.kind)
		}).toEqual({
			result: { kind: 'complete' },
			dirty: false,
			description: 'Revised description',
			text: 'New instructions',
			commands: ['updateSkill', 'saveNote']
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('does not add a description write when only the instruction title changes', async () => {
	const { controller, resources } = await setup();
	try {
		controller.rename('Revised title');
		await controller.save();
		expect({
			title: controller.note.title,
			commands: resources.pending.map((entry) => entry.intent.command.kind)
		}).toEqual({ title: 'Revised title', commands: ['saveNote'] });
	} finally {
		controller.close();
		resources.stop();
	}
});
it('cancels scheduled autosave when the editor closes', async () => {
	const { controller, scheduler, resources } = await setup();
	try {
		controller.rename('Late title');
		controller.close();
		await scheduler.advance(2000);
		expect(resources.pending).toEqual([]);
	} finally {
		resources.stop();
	}
});
it('exports the synchronized instruction body as a portable document', async () => {
	const { controller, files, resources } = await setup();
	try {
		const result = await controller.export();
		expect({ result, downloads: files.downloads }).toEqual({
			result: { kind: 'complete' },
			downloads: [
				{
					filename: 'review.skill.md',
					content:
						'---\nname: review\ndescription: Review findings\nmetadata: {}\n---\n\nReview all findings.\n'
				}
			]
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('reports a failed synchronization without downloading an export', async () => {
	const { controller, files, resources, synchronization } = await setup();
	try {
		synchronization.result = { kind: 'failure', message: 'The workspace could not synchronize' };
		const result = await controller.export();
		expect({ result, downloads: files.downloads, busy: controller.exporting }).toEqual({
			result: synchronization.result,
			downloads: [],
			busy: false
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('suppresses an export whose synchronization finishes after account stop', async () => {
	const { controller, files, resources, synchronization, synchronized } = await setup();
	const gate = Promise.withResolvers<void>();
	synchronization.wait = gate.promise;
	const pending = controller.export();
	await synchronized;
	resources.stop();
	gate.resolve();
	expect({ result: await pending, downloads: files.downloads, busy: controller.exporting }).toEqual(
		{ result: { kind: 'superseded' }, downloads: [], busy: false }
	);
	controller.close();
});
it('does not submit an imported file after newer typing', async () => {
	const { controller, files, resources } = await setup();
	const started = Promise.withResolvers<void>();
	const content = Promise.withResolvers<string>();
	try {
		const pending = controller.import({
			text: () => {
				started.resolve();
				return content.promise;
			}
		});
		await started.promise;
		controller.changed();
		content.resolve('New instructions');
		expect({ result: await pending, imports: files.imports, busy: controller.importing }).toEqual({
			result: { kind: 'failure', message: 'Save the latest edits before importing.' },
			imports: [],
			busy: false
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('does not submit a file that finishes reading after the editor closes', async () => {
	const { controller, files, resources } = await setup();
	const started = Promise.withResolvers<void>();
	const content = Promise.withResolvers<string>();
	try {
		const pending = controller.import({
			text: () => {
				started.resolve();
				return content.promise;
			}
		});
		await started.promise;
		controller.close();
		content.resolve('New instructions');
		expect({ result: await pending, imports: files.imports, busy: controller.importing }).toEqual({
			result: { kind: 'superseded' },
			imports: [],
			busy: false
		});
	} finally {
		resources.stop();
	}
});

it('retains dirty instructions when invalid description metadata prevents saving', async () => {
	const { controller, buffer, resources } = await setup();
	try {
		buffer.value = {
			...buffer.value,
			description: 'a'.repeat(1025),
			plainText: 'Unsaved instructions'
		};
		controller.changed();
		const result = await controller.save();
		expect({ result, dirty: controller.dirty, pending: resources.pending }).toEqual({
			result: {
				kind: 'failure',
				message: 'Skill description is too long (maximum 1024 characters)'
			},
			dirty: true,
			pending: []
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('refuses to export instructions that are still pending synchronization', async () => {
	const { controller, files, resources } = await setup();
	try {
		controller.rename('Offline title');
		const result = await controller.export();
		expect({
			result,
			downloads: files.downloads,
			pending: resources.pending.map((entry) => entry.intent.command.kind)
		}).toEqual({
			result: { kind: 'failure', message: 'Save the skill before exporting.' },
			downloads: [],
			pending: ['saveNote']
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
it('reports an unreadable import without sending it to the server', async () => {
	const { controller, files, resources } = await setup();
	try {
		const result = await controller.import({
			text: async () => {
				throw new Error('Could not read the file');
			}
		});
		expect({ result, imports: files.imports, busy: controller.importing }).toEqual({
			result: { kind: 'failure', message: 'Could not read the file' },
			imports: [],
			busy: false
		});
	} finally {
		controller.close();
		resources.stop();
	}
});
