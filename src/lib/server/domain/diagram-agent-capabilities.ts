import { and, eq, inArray } from 'drizzle-orm';
import type {
	ActorContext,
	AgentEvent,
	ConversationId,
	Diagram,
	DiagramId,
	DrawioDiagram,
	MermaidDiagram,
	Note,
	NoteId,
	ProjectId,
	ProvenanceId,
	RunAgentInput,
	Skill,
	SkillSummary,
	SkillUsageView,
	TextSelection
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type {
	AgentContextBuilder,
	AgentRunner,
	DiagramFinder,
	DiagramDeleter,
	DiagramIndexer,
	DiagramLister,
	DiagramPromoter,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramCreator,
	DrawioDiagramExporter,
	MermaidDiagramCreator,
	MermaidDiagramRenderer,
	MermaidDiagramReviser,
	NoteReader,
	SkillCreator,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder
} from '$lib/services';
import type { ProvenanceRecorder, SuggestionCreator } from '$lib/services';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toDiagram, toNote, toSkill } from './mappers';

const now = () => new Date().toISOString() as Diagram['createdAt'];
const escapeXml = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export class PostgresDiagramCapabilities
	implements
		MermaidDiagramCreator,
		MermaidDiagramReviser,
		MermaidDiagramRenderer,
		DrawioDiagramCreator,
		DrawioDiagramExporter,
		DiagramPromoter,
		DiagramTextExtractor,
		DiagramFinder,
		DiagramDeleter,
		DiagramLister,
		DiagramWriter,
		DiagramIndexer
{
	constructor(private readonly database: Database) {}

	async create(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<{ title?: string; source: string }>;
	async create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	async create(
		actor: ActorContext,
		input: TextSelection | Diagram,
		instruction?: string
	): Promise<{ title?: string; source: string } | Diagram> {
		if ('text' in input) {
			if (!input.text.trim()) throw new ValidationError('Diagram source text is required');
			const labels = input.text
				.split(/(?:->|calls|to)/i)
				.map((label) => label.trim().replace(/[.!]+$/, ''))
				.filter(Boolean);
			return {
				title: instruction ? `Diagram: ${instruction}` : 'Generated diagram',
				source: `flowchart LR\n${labels.map((label, index) => `  N${index}["${label}"]`).join('\n')}\n${labels
					.slice(1)
					.map((_, index) => `  N${index} --> N${index + 1}`)
					.join('\n')}`
			};
		}
		const [ownedNote] = await this.database
			.select({ projectId: schema.notes.projectId })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, input.noteId), eq(schema.notes.userId, actor.userId)));
		if (!ownedNote) throw new NotFoundError('Diagram note was not found');
		const [row] = await this.database
			.insert(schema.diagrams)
			.values({
				id: input.id,
				userId: actor.userId,
				projectId: ownedNote.projectId,
				noteId: input.noteId,
				kind: input.kind,
				title: input.title,
				source: input.source,
				renderedSvg: input.renderedSvg,
				searchableText: input.searchableText,
				promotedFromId: input.kind === 'drawio' ? input.promotedFromId : undefined,
				sourceAnchorId: input.sourceAnchorId,
				provenanceId: input.provenanceId
			})
			.returning();
		return toDiagram(row!);
	}

	async revise(
		_actor: ActorContext,
		diagram: MermaidDiagram,
		instruction: string
	): Promise<MermaidDiagram> {
		return { ...diagram, source: `${diagram.source}\n%% ${instruction}`, updatedAt: now() };
	}

	async render(source: string): Promise<string> {
		if (!/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)/m.test(source))
			throw new ValidationError('Generated Mermaid is invalid');
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(source)}</text></svg>`;
	}

	async createFromMermaid(actor: ActorContext, diagram: MermaidDiagram): Promise<DrawioDiagram> {
		return {
			...diagram,
			id: crypto.randomUUID() as DiagramId,
			userId: actor.userId,
			kind: 'drawio',
			source: `<mxfile><diagram name="Page-1">${escapeXml(diagram.source)}</diagram></mxfile>`,
			promotedFromId: diagram.id,
			createdAt: now(),
			updatedAt: now()
		};
	}

	async exportSvg(diagram: DrawioDiagram): Promise<string> {
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(diagram.searchableText || diagram.title || 'Draw.io diagram')}</text></svg>`;
	}

	async promote(
		_actor: ActorContext,
		source: MermaidDiagram,
		target: DrawioDiagram
	): Promise<DrawioDiagram> {
		return { ...target, promotedFromId: source.id };
	}

	async extract(diagram: Diagram): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/[^a-z0-9 _.-]+/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	async get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const [row] = await this.database
			.select()
			.from(schema.diagrams)
			.where(and(eq(schema.diagrams.id, diagramId), eq(schema.diagrams.userId, actor.userId)));
		if (!row) throw new NotFoundError('Diagram was not found');
		return toDiagram(row);
	}

	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]> {
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.noteId, noteId)))
		).map(toDiagram);
	}

	async listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]> {
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(
					and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.projectId, projectId))
				)
		).map(toDiagram);
	}

	async update(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		const [row] = await this.database
			.update(schema.diagrams)
			.set({
				title: diagram.title,
				source: diagram.source,
				renderedSvg: diagram.renderedSvg,
				searchableText: diagram.searchableText
			})
			.where(and(eq(schema.diagrams.id, diagram.id), eq(schema.diagrams.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Diagram was not found');
		return toDiagram(row);
	}

	async delete(actor: ActorContext, diagramId: DiagramId): Promise<void> {
		const [row] = await this.database
			.delete(schema.diagrams)
			.where(and(eq(schema.diagrams.id, diagramId), eq(schema.diagrams.userId, actor.userId)))
			.returning({ id: schema.diagrams.id });
		if (!row) throw new NotFoundError('Diagram was not found');
	}

	async index(): Promise<void> {
		// Diagram labels are stored on the aggregate and included by retrieval adapters.
	}
}

export class PostgresSkillCapabilities
	implements SkillCreator, SkillFinder, SkillUsageLister, SkillUsageRecorder
{
	constructor(private readonly database: Database) {}

	async create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill> {
		if (!input.name.trim()) throw new ValidationError('Skill name is required');
		const [ownedNote] = await this.database
			.select()
			.from(schema.notes)
			.where(and(eq(schema.notes.id, note.id), eq(schema.notes.userId, actor.userId)));
		if (!ownedNote) throw new NotFoundError('Skill note was not found');
		await this.database
			.update(schema.notes)
			.set({ kind: 'skill' })
			.where(and(eq(schema.notes.id, note.id), eq(schema.notes.userId, actor.userId)));
		const [row] = await this.database
			.insert(schema.skills)
			.values({ noteId: note.id, ...input, triggerHints: [...input.triggerHints] })
			.onConflictDoUpdate({
				target: schema.skills.noteId,
				set: { ...input, triggerHints: [...input.triggerHints] }
			})
			.returning();
		const [noteRow] = await this.database
			.select()
			.from(schema.notes)
			.where(and(eq(schema.notes.id, note.id), eq(schema.notes.userId, actor.userId)));
		if (!noteRow) throw new NotFoundError('Skill note was not found');
		return toSkill(noteRow, row!);
	}

	async createFromSelection(
		actor: ActorContext,
		selection: TextSelection,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill> {
		const [sourceNote] = await this.database
			.select({ projectId: schema.notes.projectId })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, selection.noteId), eq(schema.notes.userId, actor.userId)));
		if (!sourceNote) throw new NotFoundError('Selection note was not found');
		const [note] = await this.database
			.insert(schema.notes)
			.values({
				userId: actor.userId,
				projectId: sourceNote.projectId,
				kind: 'skill',
				title: input.name,
				plainText: selection.text,
				document: { type: 'doc', content: [{ type: 'paragraph', text: selection.text }] }
			})
			.returning();
		return this.create(actor, toNote(note!), input);
	}

	async listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		const rows = await this.database
			.select({ note: schema.notes, skill: schema.skills })
			.from(schema.skills)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.skills.noteId))
			.where(and(eq(schema.notes.userId, actor.userId), eq(schema.skills.isEnabled, true)));
		return rows.map(({ note, skill }) => ({
			noteId: toNote(note).id,
			name: skill.name,
			description: skill.description,
			triggerHints: skill.triggerHints,
			isEnabled: skill.isEnabled
		}));
	}

	async load(actor: ActorContext, noteId: NoteId): Promise<Skill> {
		const [row] = await this.database
			.select({ note: schema.notes, skill: schema.skills })
			.from(schema.skills)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.skills.noteId))
			.where(and(eq(schema.notes.userId, actor.userId), eq(schema.notes.id, noteId)));
		if (!row) throw new NotFoundError('Skill was not found');
		return toSkill(row.note, row.skill);
	}

	async record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void> {
		const { skillNoteId, contextNoteId, provenanceId } = input;
		await this.load(actor, skillNoteId);
		if (contextNoteId) {
			const [context] = await this.database
				.select({ id: schema.notes.id })
				.from(schema.notes)
				.where(and(eq(schema.notes.id, contextNoteId), eq(schema.notes.userId, actor.userId)));
			if (!context) throw new NotFoundError('Skill context note was not found');
		}
		const [ownedProvenance] = await this.database
			.select({ id: schema.provenance.id })
			.from(schema.provenance)
			.where(
				and(eq(schema.provenance.id, provenanceId), eq(schema.provenance.userId, actor.userId))
			);
		if (!ownedProvenance) throw new NotFoundError('Skill usage provenance was not found');
		await this.database
			.insert(schema.skillUsages)
			.values({ skillNoteId, contextNoteId, provenanceId });
	}

	async list(actor: ActorContext, skillNoteId: NoteId): Promise<readonly SkillUsageView[]> {
		await this.load(actor, skillNoteId);
		const rows = await this.database
			.select()
			.from(schema.skillUsages)
			.where(eq(schema.skillUsages.skillNoteId, skillNoteId));
		return Promise.all(
			rows.map(async (usage) => {
				const [context] = usage.contextNoteId
					? await this.database
							.select()
							.from(schema.notes)
							.where(
								and(eq(schema.notes.id, usage.contextNoteId), eq(schema.notes.userId, actor.userId))
							)
					: [];
				return {
					usage: {
						...usage,
						contextNoteId: usage.contextNoteId ?? undefined,
						provenanceId: usage.provenanceId ?? undefined,
						createdAt: usage.createdAt.toISOString()
					} as unknown as SkillUsageView['usage'],
					...(context ? { contextNote: { id: toNote(context).id, title: context.title } } : {})
				};
			})
		);
	}
}

export class BasicAgentCapabilities implements AgentContextBuilder, AgentRunner {
	constructor(
		private readonly suggestionCreator?: SuggestionCreator,
		private readonly provenanceRecorder?: ProvenanceRecorder,
		private readonly noteReader?: NoteReader
	) {}

	async build(
		actor: ActorContext,
		input: RunAgentInput,
		_run: { provenanceId: ProvenanceId }
	): Promise<Readonly<Record<string, unknown>>> {
		void _run;
		const note =
			input.noteId && this.noteReader ? await this.noteReader.get(actor, input.noteId) : undefined;
		return {
			projectId: input.projectId ?? note?.projectId,
			noteId: input.noteId,
			noteTitle: note?.title,
			selection: input.selection
		};
	}

	async *run(
		actor: ActorContext,
		input: RunAgentInput,
		context: Readonly<Record<string, unknown>>
	): AsyncIterable<AgentEvent> {
		if (/search|find|what did/i.test(input.prompt)) {
			yield { type: 'tool_started', name: 'knowledge_search' };
			yield { type: 'tool_completed', name: 'knowledge_search' };
		}
		yield { type: 'text_delta', text: `I can help with: ${input.prompt}` };
		if (
			/(?:create|add|make).*(?:todo|task)/i.test(input.prompt) &&
			this.suggestionCreator &&
			this.provenanceRecorder
		) {
			const provenance = await this.provenanceRecorder.record(actor, {
				producerKind: 'agent',
				producerName: 'Agent',
				pipeline: 'agent',
				metadata: {}
			});
			const suggestion = await this.suggestionCreator.create(actor, {
				kind: 'todo',
				noteId: input.noteId,
				provenanceId: provenance.id,
				payload: {
					...(typeof context.projectId === 'string'
						? { projectId: context.projectId as ProjectId }
						: {}),
					title:
						input.prompt
							.replace(/^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:todo|task)\s*/i, '')
							.trim() || 'Agent task',
					responsibility: 'mine',
					provenanceId: provenance.id
				}
			});
			yield { type: 'suggestion', suggestion };
		}
		yield {
			type: 'completed',
			conversationId: (input.conversationId ?? crypto.randomUUID()) as ConversationId
		};
	}
}
