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
const STUDIO_GESTURE =
	'Keeping a diagram is the user saying it is worth keeping; the studio owns that gate.';
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
		ls: { kind: 'read', tools: ['ls'] },
		grep: { kind: 'read', tools: ['grep'] },
		sed: { kind: 'read', tools: ['sed'] }
	},
	workspace: {
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
		getShellContext: { kind: 'read', tools: ['get_workspace_context'] },
		getTodayView: { kind: 'read', tools: ['get_today_view'] }
	},
	projects: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_projects'] },
		get: { kind: 'read', tools: ['get_project'] },
		create: { kind: 'mutation', tools: ['create_project'] },
		rename: { kind: 'mutation', tools: ['rename_project'] },
		archive: { kind: 'mutation', tools: ['archive_project'] },
		createFolder: { kind: 'mutation', tools: ['create_folder'] },
		move: { kind: 'mutation', tools: ['move_project_entry'] },
		setSectionNumberingDefault: {
			kind: 'excluded',
			reason: 'A viewing default for the editor; it changes nothing the agent can read.'
		}
	},
	notes: {
		importMarkdownArchive: {
			kind: 'excluded',
			reason: 'Archive imports require a user-supplied multipart file.'
		},
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		getForAgent: { kind: 'read', tools: ['get_note'] },
		get: {
			kind: 'excluded',
			reason: 'Full note view for application readers; agents use getForAgent.'
		},
		listDocuments: {
			kind: 'excluded',
			reason: 'Request batching for the export dialog; the agent reads a note with get_note.'
		},
		create: { kind: 'mutation', tools: ['create_note'] },
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
			kind: 'mutation',
			tools: ['save_note', 'edit_note', 'save_skill', 'edit_skill']
		},

		publish: { kind: 'mutation', tools: ['publish_note'] },
		discardDraft: { kind: 'mutation', tools: ['discard_note_draft'] },

		searchText: {
			kind: 'excluded',
			reason: 'Global text search is a UI surface; the agent finds notes with search_knowledge.'
		},
		replaceText: {
			kind: 'excluded',
			reason: 'Bulk replace is a UI surface; the agent edits a note with edit_note.'
		},
		rename: { kind: 'mutation', tools: ['rename_note'] },
		archive: { kind: 'mutation', tools: ['archive_note'] },
		restore: { kind: 'mutation', tools: ['restore_note'] },
		listTrash: { kind: 'read', tools: ['list_trashed_notes'] },
		deleteForever: { kind: 'mutation', tools: ['delete_note_forever'] },
		emptyTrash: { kind: 'mutation', tools: ['empty_note_trash'] },
		listRevisions: { kind: 'read', tools: ['list_note_versions'] },
		getRevision: {
			kind: 'excluded',
			reason: 'Diff rendering detail; the agent reads note content with get_note.'
		},
		readRevision: {
			kind: 'excluded',
			reason: 'Published version bodies are mounted under the note versions directory for sed.'
		},
		compareRevisions: { kind: 'read', tools: ['diff_note_versions'] },
		restoreRevision: { kind: 'mutation', tools: ['restore_note_version'] },
		setSectionNumbering: {
			kind: 'excluded',
			reason: 'Section numbering is a visual editor preference; note content is unchanged.'
		}
	},
	todos: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_todos'] },
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
		create: { kind: 'mutation', tools: ['create_todo'] },
		createBatch: { kind: 'mutation', tools: ['create_todos'] },
		update: { kind: 'mutation', tools: ['update_todo'] },
		remove: {
			kind: 'excluded',
			reason: 'Deleting todos stays a deliberate user action in the detail panel.'
		},
		extractPromises: { kind: 'proposal', tools: ['extract_promises'] },
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
		suggestFromSelection: { kind: 'proposal', tools: ['relate_selection'] },
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
		suggestFromSelection: { kind: 'proposal', tools: ['find_references'] },
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
		generateMermaid: {
			kind: 'excluded',
			reason:
				'Mermaid generation is the inline note editor flow; the agent presents a canvas diagram with create_diagram.'
		},
		reviseMermaid: { kind: 'mutation', tools: ['revise_mermaid_diagram'] },
		reviseInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline diagram revision is scoped to the editor workflow.'
		},
		convertInlineMermaid: {
			kind: 'excluded',
			reason: 'Inline draw.io conversion is scoped to the note editor review workflow.'
		},
		promote: { kind: 'proposal', tools: ['promote_diagram'] },
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
		synchronize: {
			kind: 'excluded',
			reason: 'Deliver version-guarded device mutations through the shared outbox.'
		},
		// `read` is about approval: it stores nothing, so it raises no prompt. How it
		// is *rendered* afterwards is a separate question, answered by the `proposal`
		// family in `tool-disclosure.ts`.
		createDiagram: { kind: 'mutation', tools: ['create_diagram'] },
		// A revision writes a working revision onto the diagram it names, so it asks
		// first. `read` would mean no prompt, which is how the agent came to change a
		// saved diagram with neither permission asked nor anything shown.
		editDiagram: { kind: 'mutation', tools: ['edit_diagram'] },
		readCanvasDiagram: { kind: 'read', tools: ['read_canvas_diagram'] },
		readProjectDiagram: { kind: 'read', tools: ['read_project_diagram'] },
		searchDiagramIcons: { kind: 'read', tools: ['search_icons'] },
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
		list: { kind: 'read', tools: ['list_suggestions'] },
		listPendingMemory: {
			kind: 'excluded',
			reason: 'Pending memory review is scoped to the notification and memory UI.'
		},
		acceptReviewed: { kind: 'mutation', tools: ['accept_suggestion'] },
		accept: {
			kind: 'excluded',
			reason:
				'Acceptance goes through acceptReviewed, which refuses a draw.io diagram that has no review to draw its preview.'
		},
		reject: { kind: 'mutation', tools: ['reject_suggestion'] },
		revert: { kind: 'mutation', tools: ['revert_suggestion'] }
	},
	skills: {
		synchronize: {
			kind: 'excluded',
			reason: 'Offline replay uses guarded browser mutation receipts.'
		},
		list: { kind: 'read', tools: ['list_skills'] },
		get: {
			kind: 'excluded',
			reason:
				'Skill reads go through load_skill; the controller method still serves the UI and the skill write tools.'
		},
		loadForAgent: { kind: 'read', tools: ['load_skill'] },
		create: { kind: 'mutation', tools: ['create_skill'] },
		createFromSelection: { kind: 'mutation', tools: ['create_skill_from_selection'] },
		listVersions: { kind: 'read', tools: ['list_skill_versions'] },
		restoreVersion: { kind: 'mutation', tools: ['restore_skill_version'] },
		update: { kind: 'mutation', tools: ['update_skill'] },
		setPinned: { kind: 'mutation', tools: ['set_skill_pinned'] }
	},
	attachments: {
		initiate: { kind: 'excluded', reason: 'The agent cannot upload local user files.' },
		complete: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		completeForTodo: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		list: { kind: 'read', tools: ['list_attachments'] },
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
		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		initiateTemplateUpload: {
			kind: 'excluded',
			reason: 'The agent cannot upload local user files.'
		},
		completeTemplateUpload: { kind: 'excluded', reason: 'The agent cannot commit upload intents.' },
		listTemplates: { kind: 'read', tools: ['list_templates'] },
		deleteTemplate: {
			kind: 'excluded',
			reason: 'Template management is a deliberate user action.'
		},
		generateDocument: { kind: 'mutation', tools: ['export_document'] },
		generateBundle: {
			kind: 'excluded',
			reason:
				'A zip download URL is only useful to a browser; the agent generates documents one at a time.'
		},
		previewDocument: {
			kind: 'excluded',
			reason: 'Preview is an interactive UI flow; the agent generates documents directly.'
		},
		getExportSettings: { kind: 'read', tools: ['get_export_settings'] },
		updateExportSettings: { kind: 'mutation', tools: ['update_export_settings'] },
		listArtifacts: { kind: 'read', tools: ['list_artifacts'] },
		getArtifact: { kind: 'read', tools: ['get_artifact'] },
		downloadArtifact: { kind: 'read', tools: ['download_artifact'] },
		deleteArtifact: { kind: 'mutation', tools: ['delete_artifact'] },
		regenerateArtifact: { kind: 'mutation', tools: ['regenerate_artifact'] }
	},
	trustPolicies: {
		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		list: { kind: 'read', tools: ['list_trust_policies'] },
		update: { kind: 'mutation', tools: ['update_trust_policy'] }
	},
	toolPreferences: {
		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		list: { kind: 'read', tools: ['list_tool_preferences'] },
		setEnabled: { kind: 'mutation', tools: ['set_tool_enabled'] },
		clearOverride: {
			kind: 'excluded',
			reason:
				'Resetting a project override to the workspace default is a settings-page affordance; the agent turns a tool on or off outright.'
		}
	},
	memory: {
		synchronize: { kind: 'excluded', reason: 'Device mutations use the shared versioned outbox.' },
		list: { kind: 'read', tools: ['list_project_memory', 'list_user_memory'] },
		propose: { kind: 'proposal', tools: ['propose_memory_change'] },
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
		synchronize: { kind: 'excluded', reason: 'Device mutations use the shared versioned outbox.' },
		get: { kind: 'read', tools: ['read_widget'] },
		catalog: { kind: 'read', tools: ['read_widget_catalog'] },
		list: { kind: 'read', tools: ['list_widgets'] },
		create: { kind: 'mutation', tools: ['create_widget'] },
		// Both edit tools write through one controller method and one rule, so the
		// browser, the server and an approval decide an edit the same way (ADR 0043).
		edit: { kind: 'mutation', tools: ['edit_widget_data', 'edit_widget_layout'] },
		archive: { kind: 'excluded', reason: WIDGET_GESTURE },
		restore: { kind: 'excluded', reason: WIDGET_GESTURE },
		delete: { kind: 'excluded', reason: WIDGET_GESTURE }
	},
	agentSettings: {
		synchronize: { kind: 'excluded', reason: 'Version-guarded device outbox submission.' },
		bootstrap: {
			kind: 'excluded',
			reason:
				'Deployment metadata for the offline app bootstrap; user overrides are synchronized separately.'
		},
		getPreferences: { kind: 'read', tools: ['get_agent_preferences'] },
		updatePreferences: { kind: 'mutation', tools: ['update_agent_preferences'] },
		listModels: { kind: 'read', tools: ['list_agent_models'] },
		resolveDefaults: {
			kind: 'excluded',
			reason:
				'The deployment fallback the composer names on screen; the agent already runs on a model resolved for it.'
		}
	},
	apiTokens: {
		list: { kind: 'read', tools: ['list_api_tokens'] },
		revoke: { kind: 'mutation', tools: ['revoke_api_token'] }
	},
	retrieval: {
		search: { kind: 'read', tools: ['search', 'search_note'] }
	}
} as const satisfies AgentToolCoverage;
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
type Total<T extends never> = T;
type _CoverageCoversCatalog = Total<Exclude<ToolName, BoundToolName>>;
type _CoverageNamesNothingElse = Total<Exclude<BoundToolName, ToolName>>;
