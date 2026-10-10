import type { AgentToolContractMap } from '$lib/models/agent';
import { type ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
import type { AgentController } from '$lib/server/controllers/agent/controller';
import type { AgentSettingsController } from '$lib/server/controllers/agent/settings/controller';
import type { ToolPreferencesController } from '$lib/server/controllers/agent/tool-preferences/controller';
import type { TrustPoliciesController } from '$lib/server/controllers/agent/trust-policies/controller';
import type { ApiTokensController } from '$lib/server/controllers/api-tokens/controller';
import type { AttachmentsController } from '$lib/server/controllers/attachments/controller';
import type { DeliverablesController } from '$lib/server/controllers/deliverables/controller';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { DiagramsController } from '$lib/server/controllers/diagrams/controller';
import type { RetrievalController } from '$lib/server/controllers/knowledge-search/controller';
import type { MemoryController } from '$lib/server/controllers/memory/controller';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import type { ProjectsController } from '$lib/server/controllers/projects/controller';
import type { ReferencesController } from '$lib/server/controllers/references/controller';
import type { RelationshipsController } from '$lib/server/controllers/relationships/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { SuggestionsController } from '$lib/server/controllers/suggestions/controller';
import type { TodosController } from '$lib/server/controllers/todos/controller';
import type { WidgetsController } from '$lib/server/controllers/widgets/controller';
import type { WorkspaceController } from '$lib/server/controllers/workspace/controller';
interface CoveredAgentControllers {
	readonly agent: AgentController;
	readonly agentFiles: AgentFilesController;
	readonly workspace: WorkspaceController;
	readonly projects: ProjectsController;
	readonly notes: NotesController;
	readonly todos: TodosController;
	readonly relationships: RelationshipsController;
	readonly references: ReferencesController;
	readonly diagrams: DiagramsController;
	readonly diagramStudio: DiagramStudioController;
	readonly suggestions: SuggestionsController;
	readonly skills: SkillsController;
	readonly trustPolicies: TrustPoliciesController;
	readonly toolPreferences: ToolPreferencesController;
	readonly agentSettings: AgentSettingsController;
	readonly apiTokens: ApiTokensController;
	readonly attachments: AttachmentsController;
	readonly deliverables: DeliverablesController;
	readonly memory: MemoryController;
	readonly widgets: WidgetsController;
	readonly retrieval: RetrievalController;
}

export type AgentToolCoverage = AgentToolContractMap<CoveredAgentControllers>;

/**
 * Why most of the studio's surface is not an agent tool: these are the user
 * saying what the project keeps, and the studio is where they say it.
 */
const STUDIO_GESTURE =
	'Keeping a diagram is the user saying it is worth keeping; the studio owns that gate.';

/** Why a widget's trash is not an agent tool: removing one is the user saying what the project keeps. */
const WIDGET_GESTURE =
	'Moving a widget to or from the trash is a user gesture in the gallery and the trash.';

export const agentToolCoverage = {
	agent: {
		execute: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		finishCancellation: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		failRun: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		recoverInterruptedRuns: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		synchronize: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		submit: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		getRun: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		listRunEvents: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		observeRun: {
			kind: 'excluded',
			reason: 'Event-stream delivery belongs to the application lifecycle.'
		},
		isRunStreamComplete: {
			kind: 'excluded',
			reason: 'Event-stream delivery belongs to the application lifecycle.'
		},
		decide: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		decideMany: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		cancel: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		retry: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		listSessions: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		renameSession: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		},
		deleteSession: {
			kind: 'excluded',
			reason: 'Chat run control belongs to the user and application lifecycle.'
		}
	},
	agentFiles: {
		agentLs: { kind: 'read', tools: ['ls'] },
		agentGrep: { kind: 'read', tools: ['grep'] },
		agentSed: { kind: 'read', tools: ['sed'] },

		ls: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		grep: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		sed: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	workspace: {
		agentGetWorkspaceContext: { kind: 'read', tools: ['get_workspace_context'] },
		agentGetTodayView: { kind: 'read', tools: ['get_today_view'] },

		pullChangePage: {
			kind: 'excluded',
			reason: 'Browser synchronization checkpoints each journal page.'
		},
		cancelMutation: {
			kind: 'excluded',
			reason: 'Browser recovery cancels uncertain local operations.'
		},
		readResource: {
			kind: 'excluded',
			reason: 'Conditional resource reads are a browser persistence protocol.'
		},
		getShellContext: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		getTodayView: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	projects: {
		agentListProjects: { kind: 'read', tools: ['list_projects'] },
		agentGetProject: { kind: 'read', tools: ['get_project'] },
		agentCreateProject: { kind: 'mutation', tools: ['create_project'] },
		agentRenameProject: { kind: 'mutation', tools: ['rename_project'] },
		agentArchiveProject: { kind: 'mutation', tools: ['archive_project'] },
		agentCreateFolder: { kind: 'mutation', tools: ['create_folder'] },
		agentMoveProjectEntry: { kind: 'mutation', tools: ['move_project_entry'] },

		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		get: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		create: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		rename: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		archive: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		createFolder: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		move: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		setSectionNumberingDefault: {
			kind: 'excluded',
			reason: 'A viewing default for the editor; it changes nothing the agent can read.'
		}
	},
	notes: {
		prepareAgentReviewedChange: {
			kind: 'excluded',
			reason: 'Review preparation is an execution phase of note tools.'
		},
		applyAgentReviewedChange: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		agentGetNote: { kind: 'read', tools: ['get_note'] },
		agentCreateNote: { kind: 'mutation', tools: ['create_note'] },
		agentSaveNote: { kind: 'mutation', tools: ['save_note'] },
		agentEditNote: { kind: 'mutation', tools: ['edit_note'] },
		agentRenameNote: { kind: 'mutation', tools: ['rename_note'] },
		agentArchiveNote: { kind: 'mutation', tools: ['archive_note'] },
		agentRestoreNote: { kind: 'mutation', tools: ['restore_note'] },
		agentListTrashedNotes: { kind: 'read', tools: ['list_trashed_notes'] },
		agentDeleteNoteForever: { kind: 'mutation', tools: ['delete_note_forever'] },
		agentEmptyNoteTrash: { kind: 'mutation', tools: ['empty_note_trash'] },
		agentListNoteVersions: { kind: 'read', tools: ['list_note_versions'] },
		agentDiffNoteVersions: { kind: 'read', tools: ['diff_note_versions'] },
		agentRestoreNoteVersion: { kind: 'mutation', tools: ['restore_note_version'] },
		agentPublishNote: { kind: 'mutation', tools: ['publish_note'] },
		agentDiscardNoteDraft: { kind: 'mutation', tools: ['discard_note_draft'] },
		agentSaveSkill: { kind: 'mutation', tools: ['save_skill'] },
		agentEditSkill: { kind: 'mutation', tools: ['edit_skill'] },

		importMarkdownArchive: {
			kind: 'excluded',
			reason: 'Archive imports require a user-supplied multipart file.'
		},
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		get: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listDocuments: {
			kind: 'excluded',
			reason: 'Request batching for the export dialog; the agent reads a note with get_note.'
		},
		create: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		save: {
			kind: 'excluded',
			reason:
				'Browser draft saves use synchronized writes; agent body tools apply prepared reviews.'
		},
		prepareChange: {
			kind: 'excluded',
			reason: 'Prepares the domain review carried by note write tools; does not write.'
		},
		applyReviewedChange: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},

		publish: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		discardDraft: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},

		searchText: {
			kind: 'excluded',
			reason: 'Global text search is a UI surface; the agent finds notes with search_knowledge.'
		},
		replaceText: {
			kind: 'excluded',
			reason: 'Bulk replace is a UI surface; the agent edits a note with edit_note.'
		},
		rename: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		archive: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		restore: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listTrash: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		deleteForever: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		emptyTrash: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listRevisions: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		getRevision: {
			kind: 'excluded',
			reason: 'Diff rendering detail; the agent reads note content with get_note.'
		},
		readRevision: {
			kind: 'excluded',
			reason: 'Published version bodies are mounted under the note versions directory for sed.'
		},
		compareRevisions: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		restoreRevision: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		setSectionNumbering: {
			kind: 'excluded',
			reason: 'Section numbering is a visual editor preference; note content is unchanged.'
		}
	},
	todos: {
		agentExtractPromises: { kind: 'proposal', tools: ['extract_promises'] },
		agentListTodos: { kind: 'read', tools: ['list_todos'] },
		agentCreateTodo: { kind: 'mutation', tools: ['create_todo'] },
		agentCreateTodos: { kind: 'mutation', tools: ['create_todos'] },
		agentUpdateTodo: { kind: 'mutation', tools: ['update_todo'] },

		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		get: {
			kind: 'excluded',
			reason: 'Reading one todo adds nothing over list, which already returns the same fields.'
		},
		count: {
			kind: 'excluded',
			reason: 'Counts serve the context bar; the agent reads todos through list.'
		},
		listCategories: {
			kind: 'excluded',
			reason: 'Category names serve the filter menu; the agent reads todos through list.'
		},
		exportBoardPdf: {
			kind: 'excluded',
			reason: 'Board export is a user download; the agent reads todos through list.'
		},
		create: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		createBatch: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		update: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		remove: {
			kind: 'excluded',
			reason: 'Deleting todos stays a deliberate user action in the detail panel.'
		},
		extractPromises: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		executePromiseRun: {
			kind: 'excluded',
			reason: 'The application executes persisted promise extraction requests.'
		},
		recoverQueuedPromiseRuns: {
			kind: 'excluded',
			reason: 'The application resumes queued promise extraction requests after startup.'
		},
		startExtractPromises: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	relationships: {
		agentRelateSelection: { kind: 'proposal', tools: ['relate_selection'] },

		suggestFromSelection: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		executeRelatedNoteRun: {
			kind: 'excluded',
			reason: 'The Relationships controller executes a saved related-note request.'
		},
		recoverQueuedRelatedNoteRuns: {
			kind: 'excluded',
			reason: 'Startup resumes queued related-note searches.'
		},
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	references: {
		agentFindReferences: { kind: 'proposal', tools: ['find_references'] },

		suggestFromSelection: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		executeReferenceRun: {
			kind: 'excluded',
			reason: 'The References controller executes a stored editor request.'
		},
		recoverQueuedReferenceRuns: {
			kind: 'excluded',
			reason: 'Startup recovers committed reference searches.'
		},
		startSuggestFromSelection: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		}
	},
	diagrams: {
		agentReviseMermaidDiagram: { kind: 'mutation', tools: ['revise_mermaid_diagram'] },
		agentPromoteDiagram: { kind: 'proposal', tools: ['promote_diagram'] },

		generateMermaid: {
			kind: 'excluded',
			reason:
				'Mermaid generation is the inline note editor flow; the agent presents a canvas diagram with create_diagram.'
		},
		reviseMermaid: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		reviseInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline diagram revision is scoped to the editor workflow.'
		},
		convertInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline draw.io conversion is scoped to the note editor review workflow.'
		},
		promote: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		startGenerateMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		},
		startReviseInlineMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		},
		startConvertInlineMermaid: {
			kind: 'excluded',
			reason:
				'The editor starts this as a cancellable run; the agent calls the synchronous method instead.'
		},
		executeDiagramRun: {
			kind: 'excluded',
			reason: 'Executes a saved diagram action after its durable claim.'
		},
		recoverQueuedDiagramRuns: {
			kind: 'excluded',
			reason: 'Startup recovery resumes saved diagram actions.'
		}
	},
	diagramStudio: {
		agentCreateDiagram: { kind: 'mutation', tools: ['create_diagram'] },
		agentEditDiagram: { kind: 'mutation', tools: ['edit_diagram'] },
		agentReadCanvasDiagram: { kind: 'read', tools: ['read_canvas_diagram'] },
		agentSearchIcons: { kind: 'read', tools: ['search_icons'] },
		agentReadProjectDiagram: { kind: 'read', tools: ['read_project_diagram'] },

		synchronize: {
			kind: 'excluded',
			reason: 'Deliver version-guarded device mutations through the shared outbox.'
		},
		// `read` is about approval: it stores nothing, so it raises no prompt. How it
		// is *rendered* afterwards is a separate question, answered by the `proposal`
		// family in `tool-disclosure.ts`.
		createDiagram: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		// A revision writes a working revision onto the diagram it names, so it asks
		// first. `read` would mean no prompt, which is how the agent came to change a
		// saved diagram with neither permission asked nor anything shown.
		editDiagram: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		readCanvasDiagram: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		readProjectDiagram: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		searchDiagramIcons: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		// Everything below is a user gesture. Keeping, renaming and deleting are the
		// user saying what the project holds; the studio and the gallery own those
		// gates, and the agent's part is to put a version on the canvas.
		archiveProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		restoreProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		listTrashedProjectDiagrams: {
			kind: 'excluded',
			reason:
				'The trash is a place the user looks, not a source the agent reads: a diagram in it has been taken out of the project on purpose.'
		},
		findConversationDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		renameProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		saveProjectDiagramDraft: { kind: 'excluded', reason: STUDIO_GESTURE },
		publishProjectDiagram: { kind: 'excluded', reason: STUDIO_GESTURE },
		listDiagramRevisions: { kind: 'excluded', reason: STUDIO_GESTURE },
		getDiagramRevision: { kind: 'excluded', reason: STUDIO_GESTURE },
		restoreDiagramRevision: { kind: 'excluded', reason: STUDIO_GESTURE },
		deleteProjectDiagram: {
			kind: 'excluded',
			reason: 'Deleting a diagram can break notes that render it; it stays a confirmed user action.'
		},
		countDiagramReferences: {
			kind: 'excluded',
			reason: 'The reference count exists to word the delete confirmation.'
		},
		getProjectDiagram: {
			kind: 'excluded',
			reason: 'The studio canvas loads its own diagram; agent source is mounted for sed.'
		},
		listProjectDiagrams: {
			kind: 'excluded',
			reason:
				'The project diagram gallery is a UI surface; the agent finds diagrams with search_knowledge.'
		},
		countProjectDiagrams: {
			kind: 'excluded',
			reason: 'The count exists to fill in a number on the project overview.'
		}
	},
	suggestions: {
		agentListSuggestions: { kind: 'read', tools: ['list_suggestions'] },
		agentAcceptSuggestion: { kind: 'mutation', tools: ['accept_suggestion'] },
		agentRejectSuggestion: { kind: 'mutation', tools: ['reject_suggestion'] },
		agentRevertSuggestion: { kind: 'mutation', tools: ['revert_suggestion'] },

		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listPendingMemory: {
			kind: 'excluded',
			reason: 'Pending memory review is scoped to the notification and memory UI.'
		},
		acceptReviewed: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		accept: {
			kind: 'excluded',
			reason:
				'Acceptance goes through acceptReviewed, which refuses a draw.io diagram that has no review to draw its preview.'
		},
		reject: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		revert: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	skills: {
		agentLoadSkill: { kind: 'read', tools: ['load_skill'] },
		agentCreateSkillFromSelection: { kind: 'mutation', tools: ['create_skill_from_selection'] },
		agentListSkills: { kind: 'read', tools: ['list_skills'] },
		agentCreateSkill: { kind: 'mutation', tools: ['create_skill'] },
		agentListSkillVersions: { kind: 'read', tools: ['list_skill_versions'] },
		agentRestoreSkillVersion: { kind: 'mutation', tools: ['restore_skill_version'] },
		agentUpdateSkill: { kind: 'mutation', tools: ['update_skill'] },
		agentSetSkillPinned: { kind: 'mutation', tools: ['set_skill_pinned'] },

		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		get: {
			kind: 'excluded',
			reason:
				'Skill reads go through load_skill; the controller method still serves the UI and the skill write tools.'
		},
		loadForAgent: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		create: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		createFromSelection: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listVersions: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		restoreVersion: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		update: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		setPinned: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	attachments: {
		agentListAttachments: { kind: 'read', tools: ['list_attachments'] },

		initiate: { kind: 'excluded', reason: 'The agent cannot upload local user files.' },
		complete: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		completeForTodo: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listForProject: {
			kind: 'excluded',
			reason: 'Project attachments enter agent context through semantic retrieval.'
		},
		listForTodo: {
			kind: 'excluded',
			reason:
				'Todo screenshots enter agent context through the description text and semantic retrieval.'
		},
		download: { kind: 'excluded', reason: 'Signed URLs are only returned to the user interface.' },
		downloadById: {
			kind: 'excluded',
			reason: 'Signed URLs are only returned to the user interface.'
		},
		retry: { kind: 'excluded', reason: 'Attachment processing is managed by the user.' },
		removeById: { kind: 'excluded', reason: 'Project attachments are managed by the user.' },
		read: {
			kind: 'excluded',
			reason: 'Extracted attachment text is mounted under the project attachments directory.'
		},
		remove: { kind: 'excluded', reason: 'Bundle resources are managed by the user.' }
	},
	deliverables: {
		agentExportDocument: { kind: 'mutation', tools: ['export_document'] },
		agentListArtifacts: { kind: 'read', tools: ['list_artifacts'] },
		agentListTemplates: { kind: 'read', tools: ['list_templates'] },
		agentGetExportSettings: { kind: 'read', tools: ['get_export_settings'] },
		agentUpdateExportSettings: { kind: 'mutation', tools: ['update_export_settings'] },
		agentGetArtifact: { kind: 'read', tools: ['get_artifact'] },
		agentDownloadArtifact: { kind: 'read', tools: ['download_artifact'] },
		agentDeleteArtifact: { kind: 'mutation', tools: ['delete_artifact'] },
		agentRegenerateArtifact: { kind: 'mutation', tools: ['regenerate_artifact'] },

		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		initiateTemplateUpload: {
			kind: 'excluded',
			reason: 'The agent cannot upload local user files.'
		},
		completeTemplateUpload: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		listTemplates: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		deleteTemplate: {
			kind: 'excluded',
			reason: 'Template management is a deliberate user action.'
		},
		generateDocument: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		generateBundle: {
			kind: 'excluded',
			reason:
				'A zip download URL is only useful to a browser; the agent generates documents one at a time.'
		},
		previewDocument: {
			kind: 'excluded',
			reason: 'Preview is an interactive UI flow; the agent generates documents directly.'
		},
		getExportSettings: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		updateExportSettings: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listArtifacts: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		getArtifact: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		downloadArtifact: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		deleteArtifact: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		regenerateArtifact: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	trustPolicies: {
		agentListTrustPolicies: { kind: 'read', tools: ['list_trust_policies'] },
		agentUpdateTrustPolicy: { kind: 'mutation', tools: ['update_trust_policy'] },

		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		update: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	toolPreferences: {
		agentListToolPreferences: { kind: 'read', tools: ['list_tool_preferences'] },
		agentSetToolEnabled: { kind: 'mutation', tools: ['set_tool_enabled'] },

		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		setEnabled: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		clearOverride: {
			kind: 'excluded',
			reason:
				'Resetting a project override to the workspace default is a settings-page affordance; the agent turns a tool on or off outright.'
		}
	},
	memory: {
		agentListProjectMemory: { kind: 'read', tools: ['list_project_memory'] },
		agentListUserMemory: { kind: 'read', tools: ['list_user_memory'] },
		agentProposeMemoryChange: { kind: 'proposal', tools: ['propose_memory_change'] },

		synchronize: { kind: 'excluded', reason: 'Device mutations use the shared versioned outbox.' },
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		propose: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		create: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		},
		update: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		},
		remove: {
			kind: 'excluded',
			reason: 'Memory changes must flow through propose_memory_change review.'
		}
	},
	widgets: {
		agentReadWidgetCatalog: { kind: 'read', tools: ['read_widget_catalog'] },
		agentCreateWidget: { kind: 'mutation', tools: ['create_widget'] },
		agentListWidgets: { kind: 'read', tools: ['list_widgets'] },
		agentReadWidget: { kind: 'read', tools: ['read_widget'] },
		agentEditWidgetData: { kind: 'mutation', tools: ['edit_widget_data'] },
		agentEditWidgetLayout: { kind: 'mutation', tools: ['edit_widget_layout'] },

		synchronize: { kind: 'excluded', reason: 'Device mutations use the shared versioned outbox.' },
		get: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		catalog: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		create: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		// Both edit tools write through one controller method and one rule, so the
		// browser, the server and an approval decide an edit the same way (ADR 0043).
		edit: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		archive: { kind: 'excluded', reason: WIDGET_GESTURE },
		restore: { kind: 'excluded', reason: WIDGET_GESTURE },
		delete: { kind: 'excluded', reason: WIDGET_GESTURE }
	},
	agentSettings: {
		agentGetAgentPreferences: { kind: 'read', tools: ['get_agent_preferences'] },
		agentUpdateAgentPreferences: { kind: 'mutation', tools: ['update_agent_preferences'] },
		agentListAgentModels: { kind: 'read', tools: ['list_agent_models'] },

		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		bootstrap: {
			kind: 'excluded',
			reason:
				'Deployment metadata for the offline app bootstrap; user overrides are synchronized separately.'
		},
		getPreferences: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		updatePreferences: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		listModels: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		resolveDefaults: {
			kind: 'excluded',
			reason:
				'The deployment fallback the composer names on screen; the agent already runs on a model resolved for it.'
		}
	},
	apiTokens: {
		agentListApiTokens: { kind: 'read', tools: ['list_api_tokens'] },
		agentRevokeApiToken: { kind: 'mutation', tools: ['revoke_api_token'] },

		list: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		},
		revoke: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	},
	retrieval: {
		agentSearch: { kind: 'read', tools: ['search'] },
		agentSearchNote: { kind: 'read', tools: ['search_note'] },

		search: {
			kind: 'excluded',
			reason:
				'Shared application operation; agent tools use the complete agent entrypoints on this controller.'
		}
	}
} as const satisfies AgentToolCoverage;

/**
 * Every tool name some controller method claims a contract for.
 *
 * `agentToolCoverage` is `as const satisfies`, so each `tools` entry keeps its
 * literals and this union is real rather than a restatement of `ToolName`.
 */
type BoundToolName = {
	[Controller in keyof typeof agentToolCoverage]: {
		[
			Method in keyof (typeof agentToolCoverage)[Controller]
		]: (typeof agentToolCoverage)[Controller][Method] extends {
			readonly tools: readonly (infer Name)[];
		}
			? Name
			: never;
	}[keyof (typeof agentToolCoverage)[Controller]];
}[keyof typeof agentToolCoverage];

/**
 * Registry and catalog name each other exactly, proved by the compiler.
 *
 * This replaced two runtime specs. A catalog name nobody bound was a tool the
 * factory could describe and never build; a bound name the catalog did not
 * carry was a tool with no description, which `toolDescription` only discovered
 * when someone constructed it. Both are now `pnpm check` failures at the
 * declaration rather than assertions in a suite that has to be run first.
 *
 * What stays runtime, and why: a union cannot see a name bound by two different
 * controller methods, and the *constructed* definition set is a function of run
 * context — `agentOnlyDefinitions` builds the selection-bound tools only when a
 * selection is present, and `McpTools` composes a different pair — so no type
 * can hold it total. `agent-tool-factory.spec.ts` covers both.
 */
type _CoverageCoversCatalog = Total<Exclude<ToolName, BoundToolName>>;
type _CoverageNamesNothingElse = Total<Exclude<BoundToolName, ToolName>>;

type Total<T extends never> = T;
