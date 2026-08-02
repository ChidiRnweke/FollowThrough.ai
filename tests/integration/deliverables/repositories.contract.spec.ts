import { describe, expect, it } from 'vitest';
import type { TemplateId } from '$lib/models/deliverables';
import * as schema from '$lib/server/db/schema';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, seedArtifact, seedNote } from '../database-harness';
describe('Postgres artifact repository listing invariants', () => {
	it('matches artifact titles with a case-insensitive substring', async () => {
		const owner = actor('301');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact search title'
		});
		await seedArtifact(owner, project.id, '301', { title: 'Quarterly Strategy Review' });
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id, {
			query: 'STRATEGY'
		});
		expect(result.total).toBe(1);
	});
	it('matches artifact formats with a case-insensitive substring', async () => {
		const owner = actor('302');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact search format'
		});
		await seedArtifact(owner, project.id, '302', { format: 'docx' });
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id, {
			query: 'OCX'
		});
		expect(result.total).toBe(1);
	});
	it('matches template names with a case-insensitive substring', async () => {
		const owner = actor('303');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact search template'
		});
		const templateId = '80000000-0000-4000-8000-000000000303' as TemplateId;
		await context.db.insert(schema.projectTemplates).values({
			id: templateId,
			userId: owner.userId,
			projectId: project.id,
			name: 'Executive Briefing',
			objectKey: 'templates/executive.docx',
			mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			byteSize: 100
		});
		await seedArtifact(owner, project.id, '303', { templateId });
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id, {
			query: 'brief'
		});
		expect(result.total).toBe(1);
	});
	it('does not match a null template for an unrelated search', async () => {
		const owner = actor('304');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact null template'
		});
		await seedArtifact(owner, project.id, '304');
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id, {
			query: 'missing'
		});
		expect(result.artifacts).toEqual([]);
	});
	it('keeps artifact listings scoped to the actor and project', async () => {
		const owner = actor('305');
		const other = actor('306');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Owned artifacts'
		});
		const otherProject = await new ProjectRecords(context.db).insert(other, {
			name: 'Other artifacts'
		});
		await seedArtifact(owner, project.id, '305');
		await seedArtifact(other, otherProject.id, '306');
		const result = await new ArtifactRecords(context.db).listByProject(other, project.id);
		expect(result.total).toBe(0);
	});
	it('counts all filtered artifacts before pagination', async () => {
		const owner = actor('307');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact count'
		});
		for (let index = 0; index < 12; index += 1) {
			await seedArtifact(owner, project.id, String(30700 + index), { title: `Match ${index}` });
		}
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id, {
			query: 'match',
			limit: 10
		});
		expect(result.total).toBe(12);
	});
	it('returns non-overlapping deterministic pages', async () => {
		const owner = actor('308');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Artifact pages'
		});
		for (let index = 0; index < 20; index += 1) {
			await seedArtifact(owner, project.id, String(30800 + index));
		}
		const repository = new ArtifactRecords(context.db);
		const first = await repository.listByProject(owner, project.id, { limit: 10, offset: 0 });
		const second = await repository.listByProject(owner, project.id, { limit: 10, offset: 10 });
		expect([...first.artifacts, ...second.artifacts].map((artifact) => artifact.id)).toEqual(
			Array.from(
				{ length: 20 },
				(_, index) => `70000000-0000-4000-8000-${String(30800 + index).padStart(12, '0')}`
			)
		);
	});
	it('keeps omitted listing parameters unbounded', async () => {
		const owner = actor('309');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Unbounded artifacts'
		});
		for (let index = 0; index < 11; index += 1) {
			await seedArtifact(owner, project.id, String(30900 + index));
		}
		const result = await new ArtifactRecords(context.db).listByProject(owner, project.id);
		expect(result.artifacts).toHaveLength(11);
	});
});
describe('Postgres export-settings repository invariants', () => {
	it('returns nothing before settings are saved', async () => {
		const { owner, project } = await seedNote('80');
		const repository = new ExportSettingsRecords(context.db);
		expect(await repository.find(owner, project.id)).toBeUndefined();
	});
	it('round-trips upserted settings', async () => {
		const { owner, project } = await seedNote('81');
		const repository = new ExportSettingsRecords(context.db);
		const settings = { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 } as const;
		await repository.upsert(owner, project.id, settings);
		expect(await repository.find(owner, project.id)).toEqual({
			...settings,
			diagramTheme: { base: 'light' },
			includeTitle: false
		});
	});
	it('replaces settings on repeated upsert', async () => {
		const { owner, project } = await seedNote('82');
		const repository = new ExportSettingsRecords(context.db);
		await repository.upsert(owner, project.id, {
			fontFamily: 'courier',
			fontSize: 10,
			lineHeight: 1.2,
			margin: 36
		});
		await repository.upsert(owner, project.id, {
			fontFamily: 'helvetica',
			fontSize: 11,
			lineHeight: 1.35,
			margin: 72
		});
		expect((await repository.find(owner, project.id))?.fontFamily).toBe('helvetica');
	});
	it('does not reveal settings to another actor', async () => {
		const { owner, project } = await seedNote('83');
		const repository = new ExportSettingsRecords(context.db);
		await repository.upsert(owner, project.id, {
			fontFamily: 'times',
			fontSize: 12,
			lineHeight: 1.5,
			margin: 60
		});
		expect(await repository.find(actor('84'), project.id)).toBeUndefined();
	});
});
