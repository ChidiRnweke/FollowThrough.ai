import { z } from 'zod';
import { syncEtagSchema } from '$lib/models/sync';
import { storedDocumentSchema } from '$lib/models/notes';
import { provenanceSchema } from '$lib/models/provenance';
import { suggestionSchema } from '$lib/models/suggestions';
import { agentPayloadObjectSchema } from '$lib/models/agent/payload';
import { pendingAgentDecisionSchema } from '$lib/models/agent';
import { projectTemplateStylesSchema } from '$lib/models/projects';
import { exportSettingsOverlaySchema } from '$lib/models/deliverables';

const id = <Name extends string>() =>
	z
		.string()
		.uuid()
		.transform((value) => value as string & { readonly __brand: Name });
const instant = z
	.string()
	.datetime({ offset: true })
	.transform((value) => new Date(value).toISOString() as string & { readonly __brand: 'DateTime' });
const timestamps = { createdAt: instant, updatedAt: instant };
const owned = { userId: id<'UserId'>() };
const projectOwned = { ...owned, projectId: id<'ProjectId'>() };
const provenance = {
	sourceAnchorId: id<'SourceAnchorId'>().optional(),
	provenanceId: id<'ProvenanceId'>().optional()
};
const pipeline = z.enum(['extract_promises', 'relate', 'reference', 'agent', 'memory']);
const executionMode = z.enum(['approval_required', 'auto_accept']);

export const noteRecordSchema = z.object({
	id: id<'NoteId'>(),
	...projectOwned,
	parentId: id<'NoteId'>().optional(),
	kind: z.enum(['folder', 'note', 'skill']),
	position: z.number().int(),
	title: z.string(),
	builtInKey: z.string().optional(),
	document: storedDocumentSchema,
	plainText: z.string(),
	currentRevision: z.number().int().positive(),
	publishedRevision: z.number().int().nonnegative(),
	isPinned: z.boolean(),
	sectionNumbering: z.boolean().optional(),
	publishedAt: instant.optional(),
	archivedAt: instant.optional(),
	...timestamps
});

export const projectRecordSchema = z.object({
	id: id<'ProjectId'>(),
	...owned,
	name: z.string(),
	role: z.enum(['inbox', 'workspace']),
	description: z.string().optional(),
	sectionNumberingDefault: z.boolean().optional(),
	archivedAt: instant.optional(),
	...timestamps
});

export const todoRecordSchema = z.object({
	id: id<'TodoId'>(),
	...projectOwned,
	title: z.string(),
	description: z.string().optional(),
	status: z.enum(['backlog', 'open', 'in_progress', 'done', 'cancelled']),
	responsibility: z.enum(['mine', 'waiting_on']),
	priority: z.enum(['low', 'medium', 'high']).optional(),
	category: z.string().optional(),
	waitingOn: z.string().optional(),
	dueDate: z
		.string()
		.date()
		.transform((value) => value as string & { readonly __brand: 'LocalDate' })
		.optional(),
	dueDateVerbatim: z.string().optional(),
	promiseStrength: z.enum(['explicit', 'implied', 'tentative']).optional(),
	...provenance,
	linkedNoteId: id<'NoteId'>().optional(),
	completedAt: instant.optional(),
	deletedAt: instant.optional(),
	...timestamps
});

const diagramFields = {
	id: id<'DiagramId'>(),
	...projectOwned,
	sourceNoteId: id<'NoteId'>().optional(),
	conversationId: id<'ConversationId'>().optional(),
	title: z.string().optional(),
	renderedSvg: z.string().optional(),
	searchableText: z.string(),
	...provenance,
	archivedAt: instant.optional(),
	source: z.string(),
	...timestamps
};
export const diagramRecordSchema = z.discriminatedUnion('kind', [
	z.object({ ...diagramFields, kind: z.literal('mermaid') }),
	z.object({
		...diagramFields,
		kind: z.literal('drawio'),
		currentRevision: z.number().int().positive(),
		publishedRevision: z.number().int().nonnegative(),
		publishedAt: instant.optional(),
		promotedFromId: id<'DiagramId'>().optional()
	})
]);

export const resourceDataSchemas = {
	users: z.object({
		id: id<'UserId'>(),
		email: z.string(),
		displayName: z.string(),
		avatarUrl: z
			.string()
			.transform((value) => value as string & { readonly __brand: 'Url' })
			.optional(),
		role: z.enum(['USER', 'ADMIN', 'WAITING']),
		...timestamps
	}),
	projects: projectRecordSchema,
	notes: noteRecordSchema,
	todos: todoRecordSchema,
	diagrams: diagramRecordSchema,
	source_anchors: z.object({
		id: id<'SourceAnchorId'>(),
		noteId: id<'NoteId'>(),
		nodeId: z.string().optional(),
		from: z.number().int().optional(),
		to: z.number().int().optional(),
		quote: z.string(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
		revision: z.number().int(),
		createdAt: instant
	}),
	provenance: provenanceSchema,
	note_relationships: z.object({
		id: id<'RelationshipId'>(),
		...owned,
		sourceNoteId: id<'NoteId'>(),
		targetNoteId: id<'NoteId'>(),
		kind: z.enum(['prior_decision', 'contradicts', 'elaborates', 'mentions']),
		justification: z.string().optional(),
		...provenance,
		...timestamps
	}),
	references: z.object({
		id: id<'ReferenceId'>(),
		...projectOwned,
		noteId: id<'NoteId'>(),
		url: z
			.string()
			.url()
			.transform((value) => value as string & { readonly __brand: 'Url' }),
		title: z.string(),
		tier: z.enum(['official', 'standard', 'vendor', 'community']),
		relevanceNote: z.string(),
		...provenance,
		createdAt: instant
	}),
	skills: z.object({
		noteId: id<'NoteId'>(),
		name: z.string(),
		slug: z.string(),
		description: z.string(),
		triggerHints: z.array(z.string()),
		license: z.string().optional(),
		compatibility: z.string().optional(),
		metadata: z.record(z.string(), z.string()),
		allowImplicitInvocation: z.boolean(),
		isEnabled: z.boolean(),
		...timestamps
	}),
	project_skill_pins: z.object({
		projectId: id<'ProjectId'>(),
		skillNoteId: id<'NoteId'>(),
		createdAt: instant
	}),
	attachments: z.object({
		id: id<'AttachmentId'>(),
		...projectOwned,
		noteId: id<'NoteId'>().optional(),
		path: z.string(),
		currentVersionId: id<'AttachmentVersionId'>().optional(),
		...timestamps
	}),
	attachment_versions: z.object({
		id: id<'AttachmentVersionId'>(),
		attachmentId: id<'AttachmentId'>(),
		objectKey: z.string(),
		mediaType: z.string(),
		byteSize: z.number().int(),
		checksumSha256: z.string(),
		parserKind: z.string().optional(),
		extractedText: z.string().optional(),
		processingStatus: z.enum(['queued', 'processing', 'ready', 'partial', 'unsupported', 'failed']),
		processingFailure: z.string().optional(),
		processedAt: instant.optional(),
		createdAt: instant
	}),
	todo_attachments: z.object({
		todoId: id<'TodoId'>(),
		attachmentId: id<'AttachmentId'>(),
		createdAt: instant
	}),
	skill_usages: z.object({
		id: id<'SkillUsageId'>(),
		skillNoteId: id<'NoteId'>(),
		contextNoteId: id<'NoteId'>().optional(),
		provenanceId: id<'ProvenanceId'>().optional(),
		createdAt: instant
	}),
	suggestions: suggestionSchema,
	conversations: z.object({
		id: id<'ConversationId'>(),
		...owned,
		kind: z.enum(['chat', 'workflow']),
		contextProjectId: id<'ProjectId'>().optional(),
		contextNoteId: id<'NoteId'>().optional(),
		title: z.string().optional(),
		modelOverride: z.string().optional(),
		visionModelOverride: z.string().optional(),
		executionModeOverride: executionMode.optional(),
		...timestamps
	}),
	messages: z.object({
		id: id<'MessageId'>(),
		conversationId: id<'ConversationId'>(),
		runId: id<'AgentRunId'>().optional(),
		eventCursor: z
			.string()
			.regex(/^[0-9]+$/)
			.optional(),
		role: z.enum(['user', 'assistant', 'tool']),
		content: agentPayloadObjectSchema,
		model: z.string().optional(),
		createdAt: instant
	}),
	agent_runs: z.object({
		id: id<'AgentRunId'>(),
		...owned,
		conversationId: id<'ConversationId'>(),
		status: z.enum([
			'queued',
			'running',
			'awaiting_approval',
			'cancelling',
			'completed',
			'cancelled',
			'failed'
		]),
		failure: z.string().optional(),
		pendingDecisions: z.array(pendingAgentDecisionSchema),
		...timestamps
	}),
	agent_preferences: z.object({
		...owned,
		defaultModel: z.string().optional(),
		defaultVisionModel: z.string().optional(),
		inlineModel: z.string().optional(),
		attachmentVisionModel: z.string().optional(),
		webSearchEngine: z.string().optional(),
		webSearchMaxResults: z.number().int().optional(),
		webSearchMaxTotalResults: z.number().int().optional(),
		agentMaxTurns: z.number().int().optional(),
		executionMode,
		inlineSuggestionsEnabled: z.boolean(),
		...timestamps
	}),
	user_preferences: z.object({
		...owned,
		sectionNumberingDefault: z.boolean().optional(),
		...timestamps
	}),
	tool_preferences: z.object({
		...owned,
		toolName: z.string(),
		enabled: z.boolean(),
		...timestamps
	}),
	project_tool_overrides: z.object({
		...projectOwned,
		toolName: z.string(),
		enabled: z.boolean(),
		...timestamps
	}),
	trust_policies: z.object({
		...owned,
		pipeline,
		autoAcceptEnabled: z.boolean(),
		minimumConfidence: z.number().optional(),
		...timestamps
	}),
	memory_entries: z.object({
		id: id<'MemoryEntryId'>(),
		...owned,
		projectId: id<'ProjectId'>().optional(),
		content: z.string(),
		type: z.enum(['fact', 'decision', 'constraint', 'preference']).optional(),
		shareWithAgents: z.boolean(),
		provenanceId: id<'ProvenanceId'>().optional(),
		replacesEntryId: id<'MemoryEntryId'>().optional(),
		deletedAt: instant.optional(),
		...timestamps
	}),
	project_templates: z.object({
		id: id<'TemplateId'>(),
		...projectOwned,
		name: z.string(),
		objectKey: z.string(),
		mediaType: z.string(),
		byteSize: z.number().int(),
		extractedStyles: projectTemplateStylesSchema.optional(),
		isDefault: z.boolean(),
		...timestamps
	}),
	export_settings: z.object({
		...projectOwned,
		settings: exportSettingsOverlaySchema,
		...timestamps
	}),
	artifacts: z.object({
		id: id<'ArtifactId'>(),
		...projectOwned,
		title: z.string(),
		format: z.enum(['pdf', 'docx']),
		objectKey: z.string(),
		byteSize: z.number().int(),
		sourceNoteIds: z.array(id<'NoteId'>()),
		templateId: id<'TemplateId'>().optional(),
		provenanceId: id<'ProvenanceId'>().optional(),
		runId: z.string().optional(),
		createdAt: instant
	})
};

export const workspaceRecordSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('users'), value: resourceDataSchemas.users }),
	z.object({ type: z.literal('projects'), value: resourceDataSchemas.projects }),
	z.object({ type: z.literal('notes'), value: resourceDataSchemas.notes }),
	z.object({ type: z.literal('todos'), value: resourceDataSchemas.todos }),
	z.object({ type: z.literal('diagrams'), value: resourceDataSchemas.diagrams }),
	z.object({ type: z.literal('source_anchors'), value: resourceDataSchemas.source_anchors }),
	z.object({ type: z.literal('provenance'), value: resourceDataSchemas.provenance }),
	z.object({
		type: z.literal('note_relationships'),
		value: resourceDataSchemas.note_relationships
	}),
	z.object({ type: z.literal('references'), value: resourceDataSchemas.references }),
	z.object({ type: z.literal('skills'), value: resourceDataSchemas.skills }),
	z.object({
		type: z.literal('project_skill_pins'),
		value: resourceDataSchemas.project_skill_pins
	}),
	z.object({ type: z.literal('attachments'), value: resourceDataSchemas.attachments }),
	z.object({
		type: z.literal('attachment_versions'),
		value: resourceDataSchemas.attachment_versions
	}),
	z.object({ type: z.literal('todo_attachments'), value: resourceDataSchemas.todo_attachments }),
	z.object({ type: z.literal('skill_usages'), value: resourceDataSchemas.skill_usages }),
	z.object({ type: z.literal('suggestions'), value: resourceDataSchemas.suggestions }),
	z.object({ type: z.literal('conversations'), value: resourceDataSchemas.conversations }),
	z.object({ type: z.literal('messages'), value: resourceDataSchemas.messages }),
	z.object({ type: z.literal('agent_runs'), value: resourceDataSchemas.agent_runs }),
	z.object({ type: z.literal('agent_preferences'), value: resourceDataSchemas.agent_preferences }),
	z.object({ type: z.literal('user_preferences'), value: resourceDataSchemas.user_preferences }),
	z.object({ type: z.literal('tool_preferences'), value: resourceDataSchemas.tool_preferences }),
	z.object({
		type: z.literal('project_tool_overrides'),
		value: resourceDataSchemas.project_tool_overrides
	}),
	z.object({ type: z.literal('trust_policies'), value: resourceDataSchemas.trust_policies }),
	z.object({ type: z.literal('memory_entries'), value: resourceDataSchemas.memory_entries }),
	z.object({ type: z.literal('project_templates'), value: resourceDataSchemas.project_templates }),
	z.object({ type: z.literal('export_settings'), value: resourceDataSchemas.export_settings }),
	z.object({ type: z.literal('artifacts'), value: resourceDataSchemas.artifacts })
]);
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const workspaceObjectReadSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('found'),
		snapshot: z.object({ etag: syncEtagSchema, value: workspaceRecordSchema })
	}),
	z.object({ kind: z.literal('unchanged'), etag: syncEtagSchema }),
	z.object({ kind: z.literal('unavailable') })
]);
