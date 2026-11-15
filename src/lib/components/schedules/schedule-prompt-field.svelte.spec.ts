import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import '../../../routes/layout.css';
import type { AgentModel } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ScheduleStartView } from '$lib/models/schedules';
import type { SkillSummary } from '$lib/models/skills';
import {
	projectBuilder,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import SchedulePromptField from './schedule-prompt-field.svelte';

const model = (id: string, name: string): AgentModel => ({
	id,
	name,
	provider: 'test',
	supportsTools: true,
	supportsVision: false,
	recommended: true,
	capabilities: ['tools']
});
const skill = (suffix: number, name: string): SkillSummary => ({
	noteId: testNoteId(suffix),
	projectId: testProjectId(7),
	name,
	slug: name.toLowerCase().replaceAll(' ', '-'),
	description: `What ${name} is for`,
	triggerHints: [],
	allowImplicitInvocation: false,
	isEnabled: true,
	isPinned: false
});
const docs = projectBuilder({ id: testProjectId(7), name: 'Docs relaunch' });

/** The field with a recorder for each thing it reports, so a spec reads what the page would save. */
const field = (start: ScheduleStartView, chosenModel: string | null = null) => {
	const reported: {
		projects: (ProjectId | null)[];
		skills: (readonly NoteId[])[];
		models: (string | null)[];
	} = { projects: [], skills: [], models: [] };
	return {
		reported,
		rendered: render(SchedulePromptField, {
			prompt: 'Write a brief.',
			start,
			model: chosenModel,
			projects: [docs, projectBuilder({ id: testProjectId(8), name: 'Q4 planning' })],
			skills: [skill(41, 'Daily planning'), skill(42, 'Release notes')],
			models: [model('fast/default', 'Fast Default'), model('careful/model', 'Careful Model')],
			defaultModelId: 'fast/default',
			onprompt: () => {},
			onproject: (projectId) => reported.projects.push(projectId),
			onskills: (noteIds) => reported.skills.push(noteIds),
			onmodel: (next) => reported.models.push(next)
		})
	};
};

describe('what a schedule starts each run with', () => {
	it('shows no chip while nothing is named, and names the default model as the default', async () => {
		const { rendered } = field({ skills: [] });
		await rendered;

		await expect
			.element(page.getByRole('button', { name: 'Model for this schedule: Fast Default' }))
			.toHaveTextContent(/^Fast Default\s*· default$/);
		expect(document.querySelectorAll('[data-slot="badge"]').length).toBe(0);
	});

	it('reports the project and each skill that is chosen from the list', async () => {
		const { rendered, reported } = field({
			skills: [{ kind: 'ready', noteId: testNoteId(41), name: 'Daily planning' }]
		});
		await rendered;

		await page.getByRole('button', { name: 'Add a project or a skill' }).click();
		await page.getByRole('option', { name: 'Release notes' }).click();
		await page.getByRole('option', { name: 'Daily planning' }).click();
		await page.getByRole('option', { name: 'Docs relaunch' }).click();

		expect(reported).toEqual({
			projects: [testProjectId(7)],
			// Added after the one already named, then that one taken away.
			skills: [[testNoteId(41), testNoteId(42)], []],
			models: []
		});
	});

	it('removes the project and a skill from their chips', async () => {
		const { rendered, reported } = field({
			project: { kind: 'active', id: testProjectId(7), name: 'Docs relaunch' },
			skills: [
				{ kind: 'ready', noteId: testNoteId(41), name: 'Daily planning' },
				{ kind: 'ready', noteId: testNoteId(42), name: 'Release notes' }
			]
		});
		await rendered;

		await page.getByRole('button', { name: 'Remove the project Docs relaunch' }).click();
		await page.getByRole('button', { name: 'Remove the skill Daily planning' }).click();

		expect(reported).toEqual({ projects: [null], skills: [[testNoteId(42)]], models: [] });
	});

	it('marks a project and a skill that a run can no longer use', async () => {
		const { rendered } = field({
			project: { kind: 'archived', id: testProjectId(7), name: 'Docs relaunch' },
			skills: [
				{ kind: 'unavailable', noteId: testNoteId(41), name: 'Daily planning' },
				{ kind: 'deleted', noteId: testNoteId(42) }
			]
		});
		await rendered;

		expect(
			[...document.querySelectorAll('[data-slot="badge"]')].map((chip) => chip.textContent?.trim())
		).toEqual(['Docs relaunch · archived', 'Daily planning · turned off', 'Deleted skill']);
	});

	it('reads its own model without the default mark, and reports another choice', async () => {
		const { rendered, reported } = field({ skills: [] }, 'careful/model');
		await rendered;
		const trigger = page.getByRole('button', { name: 'Model for this schedule: Careful Model' });

		await expect.element(trigger).toHaveTextContent(/^Careful Model$/);
		await trigger.click();
		await expect.element(page.getByText('Vision model')).not.toBeInTheDocument();
		await page.getByRole('option', { name: /Use the workspace default/ }).click();

		expect(reported.models).toEqual([null]);
	});
});
