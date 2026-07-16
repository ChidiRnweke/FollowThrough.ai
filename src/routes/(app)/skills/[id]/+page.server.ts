import type { NoteId, ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const factory = AppFactory.controllerFactory();
	const noteId = params.id as NoteId;
	const [view, versions, raw, attachments, projectsOutput] = await Promise.all([
		factory.skills().get(AppFactory.actor(), { noteId }),
		factory.skills().listVersions(AppFactory.actor(), { noteId }),
		factory.skills().serialize(AppFactory.actor(), { noteId }),
		factory.attachments().list(AppFactory.actor(), noteId),
		factory.projects().list(AppFactory.actor())
	]);
	const projectSkills = await Promise.all(
		projectsOutput.projects.map(async (project) => ({
			project,
			skills: (await factory.skills().list(AppFactory.actor(), { projectId: project.id })).skills
		}))
	);
	return {
		view,
		versions,
		raw,
		attachments,
		projectPins: projectSkills.map(({ project, skills }) => ({
			project,
			pinned: skills.some((skill) => skill.noteId === noteId && skill.isPinned)
		}))
	};
};

export const actions: Actions = {
	saveStructured: async ({ params, request }) => {
		const data = await request.formData();
		try {
			const metadataValue = JSON.parse(String(data.get('metadata') ?? '{}')) as unknown;
			if (
				typeof metadataValue !== 'object' ||
				metadataValue === null ||
				Array.isArray(metadataValue) ||
				Object.values(metadataValue).some((value) => typeof value !== 'string')
			)
				throw new Error('Metadata must be a JSON object with string values');
			await AppFactory.controllerFactory()
				.skills()
				.update(AppFactory.actor(), {
					noteId: params.id as NoteId,
					displayName: String(data.get('displayName') ?? ''),
					triggerHints: String(data.get('triggerHints') ?? '')
						.split(',')
						.map((hint) => hint.trim())
						.filter(Boolean),
					manifest: {
						slug: String(data.get('slug') ?? ''),
						description: String(data.get('description') ?? ''),
						...(String(data.get('license') ?? '').trim()
							? { license: String(data.get('license')).trim() }
							: {}),
						...(String(data.get('compatibility') ?? '').trim()
							? { compatibility: String(data.get('compatibility')).trim() }
							: {}),
						metadata: metadataValue as Record<string, string>,
						allowImplicitInvocation: data.get('allowImplicitInvocation') === 'on',
						instructions: String(data.get('instructions') ?? '')
					}
				});
			return { saved: true };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Skill could not be saved'
			});
		}
	},
	save: async ({ params, request }) => {
		const data = await request.formData();
		const raw = String(data.get('raw') ?? '');
		const displayName = String(data.get('displayName') ?? '');
		try {
			await AppFactory.controllerFactory()
				.skills()
				.update(AppFactory.actor(), {
					noteId: params.id as NoteId,
					displayName,
					raw
				});
			return { saved: true };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Skill could not be saved'
			});
		}
	},
	toggle: async ({ params, request }) => {
		const enabled = String((await request.formData()).get('enabled')) === 'true';
		await AppFactory.controllerFactory()
			.skills()
			.update(AppFactory.actor(), {
				noteId: params.id as NoteId,
				isEnabled: enabled
			});
		return { enabled };
	},
	setPinned: async ({ params, request }) => {
		const data = await request.formData();
		await AppFactory.controllerFactory()
			.skills()
			.setPinned(AppFactory.actor(), {
				noteId: params.id as NoteId,
				projectId: String(data.get('projectId')) as ProjectId,
				pinned: String(data.get('pinned')) === 'true'
			});
		return { pinned: true };
	},
	removeAttachment: async ({ params, request }) => {
		const path = String((await request.formData()).get('path') ?? '');
		try {
			await AppFactory.controllerFactory()
				.attachments()
				.remove(AppFactory.actor(), params.id as NoteId, path);
			return { removed: path };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Attachment could not be removed'
			});
		}
	},
	restore: async ({ params, request }) => {
		const revision = Number((await request.formData()).get('revision'));
		if (!Number.isInteger(revision) || revision < 1)
			return fail(400, { error: 'A valid revision is required' });
		const factory = AppFactory.controllerFactory();
		await factory.skills().restoreVersion(AppFactory.actor(), {
			noteId: params.id as NoteId,
			revision
		});
		return { restored: revision };
	}
};
