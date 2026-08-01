import { z } from 'zod';
import { command, form } from '$app/server';
import { invalid } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from '$lib/server/request-actor-factory';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

const noteId = z.string().uuid();

export const toggleSkill = command(z.object({ noteId, enabled: z.boolean() }), async (input) => {
	await AppFactory.controllers()
		.skills()
		.update(requestActor(), {
			noteId: input.noteId as NoteId,
			isEnabled: input.enabled
		});
	return { enabled: input.enabled };
});

/** Hidden and submit-button inputs carry the string they were rendered with. */
const booleanText = z.enum(['true', 'false']).transform((value) => value === 'true');

export const setSkillEnabled = form(z.object({ noteId, enabled: booleanText }), async (input) => {
	await AppFactory.controllers()
		.skills()
		.update(requestActor(), { noteId: input.noteId as NoteId, isEnabled: input.enabled });
	return { enabled: input.enabled };
});

export const setSkillPinned = form(
	z.object({ noteId, projectId: z.string().uuid(), pinned: booleanText }),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.setPinned(requestActor(), {
				noteId: input.noteId as NoteId,
				projectId: input.projectId as ProjectId,
				pinned: input.pinned
			});
		return { pinned: input.pinned };
	}
);

const jsonStringMap = z.string().transform((raw, ctx) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.trim() || '{}');
	} catch {
		ctx.addIssue({ code: 'custom', message: 'Metadata must be valid JSON' });
		return z.NEVER;
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		Array.isArray(parsed) ||
		Object.values(parsed).some((value) => typeof value !== 'string')
	) {
		ctx.addIssue({ code: 'custom', message: 'Metadata must be a JSON object with string values' });
		return z.NEVER;
	}
	return parsed as Record<string, string>;
});

/** Mirrors the portable-name fallback in SkillLibrary. */
const fallbackSlug = (value: string): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64) || `skill-${crypto.randomUUID().slice(0, 8)}`;

export const saveSkillDraft = command(
	z.object({ noteId, description: z.string(), instructions: z.string() }),
	async (input) => {
		const factory = AppFactory.controllers();
		const actor = requestActor();
		const { skill } = await factory.skills().get(actor, { noteId: input.noteId as NoteId });
		await factory.skills().update(actor, {
			noteId: input.noteId as NoteId,
			manifest: {
				slug: skill.slug ?? fallbackSlug(skill.name),
				description: input.description.trim() || skill.description,
				...(skill.license ? { license: skill.license } : {}),
				...(skill.compatibility ? { compatibility: skill.compatibility } : {}),
				metadata: skill.metadata ?? {},
				allowImplicitInvocation: skill.allowImplicitInvocation ?? true,
				instructions: input.instructions
			}
		});
		return { saved: true };
	}
);

export const saveSkillDescription = command(
	z.object({ noteId, description: z.string() }),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.update(requestActor(), { noteId: input.noteId as NoteId, description: input.description });
		return { saved: true };
	}
);

export const renameSkill = command(z.object({ noteId, name: z.string().min(1) }), async (input) => {
	await AppFactory.controllers()
		.skills()
		.update(requestActor(), { noteId: input.noteId as NoteId, displayName: input.name });
	return { saved: true };
});

export const importSkillMarkdown = command(z.object({ noteId, raw: z.string() }), async (input) => {
	await AppFactory.controllers()
		.skills()
		.update(requestActor(), { noteId: input.noteId as NoteId, raw: input.raw });
	return { saved: true };
});

export const saveSkillBundle = form(
	z.object({
		noteId,
		displayName: z.string(),
		slug: z.string().min(1),
		description: z.string().min(1),
		license: z.string().optional(),
		compatibility: z.string().optional(),
		triggerHints: z.string().optional(),
		instructions: z.string(),
		metadata: jsonStringMap,
		allowImplicitInvocation: z.boolean().optional().default(false)
	}),
	async (input, issue) => {
		try {
			await AppFactory.controllers()
				.skills()
				.update(requestActor(), {
					noteId: input.noteId as NoteId,
					displayName: input.displayName,
					triggerHints: (input.triggerHints ?? '')
						.split(',')
						.map((hint) => hint.trim())
						.filter(Boolean),
					manifest: {
						slug: input.slug,
						description: input.description,
						...(input.license?.trim() ? { license: input.license.trim() } : {}),
						...(input.compatibility?.trim() ? { compatibility: input.compatibility.trim() } : {}),
						metadata: input.metadata,
						allowImplicitInvocation: input.allowImplicitInvocation,
						instructions: input.instructions
					}
				});
			return { saved: true };
		} catch (error) {
			invalid(issue.slug(error instanceof Error ? error.message : 'Skill could not be saved'));
		}
	}
);

export const saveSkillRaw = form(
	z.object({ noteId, displayName: z.string(), raw: z.string() }),
	async (input, issue) => {
		try {
			await AppFactory.controllers()
				.skills()
				.update(requestActor(), {
					noteId: input.noteId as NoteId,
					displayName: input.displayName,
					raw: input.raw
				});
			return { saved: true };
		} catch (error) {
			invalid(issue.raw(error instanceof Error ? error.message : 'Skill could not be saved'));
		}
	}
);

export const restoreSkillVersion = form(
	z.object({ noteId, revision: z.number().int().positive() }),
	async (input) => {
		await AppFactory.controllers()
			.skills()
			.restoreVersion(requestActor(), {
				noteId: input.noteId as NoteId,
				revision: input.revision
			});
		return { restored: input.revision };
	}
);
