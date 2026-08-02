import { afterAll, beforeAll, inject } from 'vitest';
import type { Artifact, ArtifactId } from '$lib/models/deliverables';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Provenance, ProvenanceId } from '$lib/models/provenance';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { PostgresDatabaseContext } from '$lib/server/db/testcontainer';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';

export let context: PostgresDatabaseContext;

export const actor = (suffix: string) => ({
	userId: `10000000-0000-4000-8000-${suffix.padStart(12, '0')}` as UserId
});

export const now = '2026-07-12T08:00:00.000Z' as DateTime;

export const seedNote = async (suffix: string, owner = actor(suffix)) => {
	const project = await new ProjectRecords(context.db).insert(owner, {
		name: `Contract project ${suffix}`
	});
	const note: Note = {
		id: `40000000-0000-4000-8000-${suffix.padStart(12, '0')}` as NoteId,
		userId: owner.userId,
		projectId: project.id,
		kind: 'note',
		position: 0,
		title: `Contract note ${suffix}`,
		document: { type: 'doc', content: [] },
		plainText: '',
		currentRevision: 1,
		publishedRevision: 0,
		isPinned: false,
		createdAt: now,
		updatedAt: now
	};
	await new NoteRecords(context.db).insert(owner, note);
	return { owner, project, note };
};

export const seedProvenance = async (owner: ReturnType<typeof actor>, suffix: string) => {
	const provenance: Provenance = {
		id: `60000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ProvenanceId,
		userId: owner.userId,
		producerKind: 'pipeline',
		producerName: 'Contract',
		pipeline: 'agent',
		metadata: {},
		createdAt: now
	};
	await new ProvenanceRecords(context.db).insert(owner, provenance);
	return provenance;
};

export const seedArtifact = async (
	owner: ReturnType<typeof actor>,
	projectId: ProjectId,
	suffix: string,
	patch: Partial<Artifact> = {}
) => {
	const artifact: Artifact = {
		id: `70000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ArtifactId,
		userId: owner.userId,
		projectId,
		title: `Artifact ${suffix}`,
		format: 'pdf',
		objectKey: `artifacts/${suffix}.pdf`,
		byteSize: 100,
		sourceNoteIds: [],
		createdAt: now,
		...patch
	};
	await new ArtifactRecords(context.db).insert(owner, artifact);
	return artifact;
};

beforeAll(() => {
	context = connectPostgresTestDatabase(inject('postgresUrl'));
});

afterAll(async () => {
	await context?.close();
});
