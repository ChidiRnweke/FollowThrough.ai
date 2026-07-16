import type {
	DateTime,
	Diagram,
	ExternalReference,
	LocalDate,
	MemoryEntry,
	Note,
	NoteRelationship,
	NoteRevision,
	Provenance,
	Project,
	Skill,
	SourceAnchor,
	Suggestion,
	Todo,
	TrustPolicy,
	Url,
	User
} from '$lib/models';
import type * as schema from '$lib/server/db/schema';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;
const domain = <T>(value: unknown): T => value as T;

export const toUser = (row: typeof schema.users.$inferSelect): User =>
	domain<User>({
		...row,
		avatarUrl: row.avatarUrl ? (row.avatarUrl as Url) : undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toProject = (row: typeof schema.projects.$inferSelect): Project =>
	domain<Project>({
		...row,
		description: row.description ?? undefined,
		archivedAt: row.archivedAt ? instant(row.archivedAt) : undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toNote = (row: typeof schema.notes.$inferSelect): Note =>
	domain<Note>({
		...row,
		parentId: row.parentId ?? undefined,
		builtInKey: row.builtInKey ?? undefined,
		document: row.document,
		archivedAt: row.archivedAt ? instant(row.archivedAt) : undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toRevision = (row: typeof schema.noteRevisions.$inferSelect): NoteRevision =>
	domain<NoteRevision>({
		...row,
		document: row.document,
		provenanceId: row.provenanceId ?? undefined,
		createdAt: instant(row.createdAt)
	});

export const toAnchor = (row: typeof schema.sourceAnchors.$inferSelect): SourceAnchor =>
	domain<SourceAnchor>({
		id: row.id,
		noteId: row.noteId,
		nodeId: row.nodeId ?? undefined,
		from: row.fromOffset ?? undefined,
		to: row.toOffset ?? undefined,
		quote: row.quote,
		prefix: row.prefix ?? undefined,
		suffix: row.suffix ?? undefined,
		revision: row.revision,
		createdAt: instant(row.createdAt)
	});

export const toProvenance = (row: typeof schema.provenance.$inferSelect): Provenance =>
	domain<Provenance>({
		...row,
		pipeline: row.pipeline ?? undefined,
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		runId: row.runId ? (row.runId as Provenance['runId']) : undefined,
		model: row.model ?? undefined,
		metadata: row.metadata,
		createdAt: instant(row.createdAt)
	});

export const toTodo = (row: typeof schema.todos.$inferSelect): Todo =>
	domain<Todo>({
		...row,
		description: row.description ?? undefined,
		dueDate: row.dueDate ? (row.dueDate as LocalDate) : undefined,
		dueDateVerbatim: row.dueDateVerbatim ?? undefined,
		promiseStrength: row.promiseStrength ?? undefined,
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		provenanceId: row.provenanceId ?? undefined,
		completedAt: row.completedAt ? instant(row.completedAt) : undefined,
		deletedAt: row.deletedAt ? instant(row.deletedAt) : undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toMemoryEntry = (row: typeof schema.memoryEntries.$inferSelect): MemoryEntry =>
	domain<MemoryEntry>({
		...row,
		provenanceId: row.provenanceId ?? undefined,
		replacesEntryId: row.replacesEntryId ?? undefined,
		deletedAt: row.deletedAt ? instant(row.deletedAt) : undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toRelationship = (
	row: typeof schema.noteRelationships.$inferSelect
): NoteRelationship =>
	domain<NoteRelationship>({
		...row,
		justification: row.justification ?? undefined,
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		provenanceId: row.provenanceId ?? undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toReference = (row: typeof schema.references.$inferSelect): ExternalReference =>
	domain<ExternalReference>({
		...row,
		url: row.url as Url,
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		provenanceId: row.provenanceId ?? undefined,
		createdAt: instant(row.createdAt)
	});

export const toDiagram = (row: typeof schema.diagrams.$inferSelect): Diagram =>
	domain<Diagram>({
		...row,
		title: row.title ?? undefined,
		renderedSvg: row.renderedSvg ?? undefined,
		promotedFromId: row.promotedFromId ?? undefined,
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		provenanceId: row.provenanceId ?? undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toSuggestion = (row: typeof schema.suggestions.$inferSelect): Suggestion =>
	domain<Suggestion>({
		...row,
		noteId: row.noteId ?? undefined,
		payload: row.payload,
		confidence: row.confidence === null ? undefined : (row.confidence as Suggestion['confidence']),
		sourceAnchorId: row.sourceAnchorId ?? undefined,
		decidedAt: row.decidedAt ? instant(row.decidedAt) : undefined,
		expiresAt: row.expiresAt ? instant(row.expiresAt) : undefined,
		appliedArtifactId: row.appliedArtifactId ?? undefined,
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toTrustPolicy = (row: typeof schema.trustPolicies.$inferSelect): TrustPolicy =>
	domain<TrustPolicy>({
		...row,
		minimumConfidence:
			row.minimumConfidence === null
				? undefined
				: (row.minimumConfidence as TrustPolicy['minimumConfidence']),
		createdAt: instant(row.createdAt),
		updatedAt: instant(row.updatedAt)
	});

export const toSkill = (
	note: typeof schema.notes.$inferSelect,
	skill: typeof schema.skills.$inferSelect
): Skill => ({
	note: toNote(note),
	name: skill.name,
	slug: skill.slug,
	description: skill.description,
	triggerHints: skill.triggerHints,
	license: skill.license ?? undefined,
	compatibility: skill.compatibility ?? undefined,
	metadata: skill.metadata,
	allowImplicitInvocation: skill.allowImplicitInvocation,
	isEnabled: skill.isEnabled
});
