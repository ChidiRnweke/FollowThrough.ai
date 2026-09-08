import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { NoteId } from '$lib/models/notes';

const noteId = z.string().uuid();

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

export const importSkillMarkdown = command(z.object({ noteId, raw: z.string() }), async (input) => {
	await AppFactory.controllers()
		.skills()
		.update(requestActor(), { noteId: input.noteId as NoteId, raw: input.raw });
	return { saved: true };
});
