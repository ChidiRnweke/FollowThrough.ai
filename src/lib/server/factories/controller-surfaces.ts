import type { ControllerSurface } from '$lib/models/controller-boundary';
import type { ControllerFactory } from './controller-factory';

/** The explicit public controller surface. Adding a capability requires declaring its boundary here. */
export const controllerSurfaces = {
	agentFiles: {
		agentLs: true,
		agentGrep: true,
		agentSed: true,

		ls: true,
		grep: true,
		sed: true
	},
	workspace: {
		agentGetWorkspaceContext: true,
		agentGetTodayView: true,

		pullChangePage: true,
		cancelMutation: true,
		readResource: true,
		getShellContext: true,
		getTodayView: true
	},
	projects: {
		agentListProjects: true,
		agentGetProject: true,
		agentCreateProject: true,
		agentRenameProject: true,
		agentArchiveProject: true,
		agentCreateFolder: true,
		agentMoveProjectEntry: true,

		synchronize: true,
		list: true,
		get: true,
		create: true,
		rename: true,
		archive: true,
		setSectionNumberingDefault: true,
		createFolder: true,
		move: true
	},
	notes: {
		prepareAgentReviewedChange: true,
		applyAgentReviewedChange: true,
		agentGetNote: true,
		agentCreateNote: true,
		agentSaveNote: true,
		agentEditNote: true,
		agentRenameNote: true,
		agentArchiveNote: true,
		agentRestoreNote: true,
		agentListTrashedNotes: true,
		agentDeleteNoteForever: true,
		agentEmptyNoteTrash: true,
		agentListNoteVersions: true,
		agentDiffNoteVersions: true,
		agentRestoreNoteVersion: true,
		agentPublishNote: true,
		agentDiscardNoteDraft: true,
		agentSaveSkill: true,
		agentEditSkill: true,

		importMarkdownArchive: true,
		prepareChange: true,
		applyReviewedChange: true,
		synchronize: true,
		get: true,
		setSectionNumbering: true,
		listDocuments: true,
		create: true,
		save: true,
		publish: true,
		discardDraft: true,
		searchText: true,
		replaceText: true,
		rename: true,
		archive: true,
		restore: true,
		listTrash: true,
		deleteForever: true,
		emptyTrash: true,
		listRevisions: true,
		getRevision: true,
		readRevision: true,
		compareRevisions: true,
		restoreRevision: true
	},
	todos: {
		agentExtractPromises: true,
		agentListTodos: true,
		agentCreateTodo: true,
		agentCreateTodos: true,
		agentUpdateTodo: true,

		createBatch: true,
		synchronize: true,
		get: true,
		list: true,
		count: true,
		listCategories: true,
		exportBoardPdf: true,
		create: true,
		update: true,
		remove: true,
		extractPromises: true,
		startExtractPromises: true,
		executePromiseRun: true,
		recoverQueuedPromiseRuns: true
	},
	relationships: {
		agentRelateSelection: true,

		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeRelatedNoteRun: true,
		recoverQueuedRelatedNoteRuns: true
	},
	references: {
		agentFindReferences: true,

		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeReferenceRun: true,
		recoverQueuedReferenceRuns: true
	},
	diagrams: {
		agentReviseMermaidDiagram: true,
		agentPromoteDiagram: true,

		generateMermaid: true,
		reviseMermaid: true,
		reviseInlineMermaid: true,
		convertInlineMermaid: true,
		promote: true,
		startGenerateMermaid: true,
		startReviseInlineMermaid: true,
		startConvertInlineMermaid: true,
		executeDiagramRun: true,
		recoverQueuedDiagramRuns: true
	},
	diagramStudio: {
		agentCreateDiagram: true,
		agentEditDiagram: true,
		agentReadCanvasDiagram: true,
		agentSearchIcons: true,
		agentReadProjectDiagram: true,

		synchronize: true,
		createDiagram: true,
		editDiagram: true,
		readCanvasDiagram: true,
		readProjectDiagram: true,
		searchDiagramIcons: true,
		getProjectDiagram: true,
		findConversationDiagram: true,
		listProjectDiagrams: true,
		countProjectDiagrams: true,
		saveProjectDiagramDraft: true,
		publishProjectDiagram: true,
		listDiagramRevisions: true,
		getDiagramRevision: true,
		restoreDiagramRevision: true,
		renameProjectDiagram: true,
		archiveProjectDiagram: true,
		restoreProjectDiagram: true,
		listTrashedProjectDiagrams: true,
		deleteProjectDiagram: true,
		countDiagramReferences: true
	},
	suggestions: {
		agentListSuggestions: true,
		agentAcceptSuggestion: true,
		agentRejectSuggestion: true,
		agentRevertSuggestion: true,

		list: true,
		listPendingMemory: true,
		accept: true,
		acceptReviewed: true,
		reject: true,
		revert: true
	},
	skills: {
		agentLoadSkill: true,
		agentCreateSkillFromSelection: true,
		agentListSkills: true,
		agentCreateSkill: true,
		agentListSkillVersions: true,
		agentRestoreSkillVersion: true,
		agentUpdateSkill: true,
		agentSetSkillPinned: true,

		synchronize: true,
		list: true,
		get: true,
		loadForAgent: true,
		create: true,
		createFromSelection: true,
		listVersions: true,
		restoreVersion: true,
		update: true,
		setPinned: true
	},
	agent: {
		execute: true,
		finishCancellation: true,
		failRun: true,
		recoverInterruptedRuns: true,
		synchronize: true,
		submit: true,
		getRun: true,
		listRunEvents: true,
		isRunStreamComplete: true,
		decide: true,
		decideMany: true,
		cancel: true,
		retry: true,
		listSessions: true,
		renameSession: true,
		deleteSession: true
	},
	agentSettings: {
		agentGetAgentPreferences: true,
		agentUpdateAgentPreferences: true,
		agentListAgentModels: true,

		synchronize: true,
		getPreferences: true,
		updatePreferences: true,
		listModels: true,
		resolveDefaults: true,
		bootstrap: true
	},
	userSettings: {
		synchronize: true,
		getPreferences: true,
		updatePreferences: true
	},
	apiTokens: {
		agentListApiTokens: true,
		agentRevokeApiToken: true,

		list: true,
		revoke: true
	},
	toolPreferences: {
		agentListToolPreferences: true,
		agentSetToolEnabled: true,

		synchronize: true,
		list: true,
		setEnabled: true,
		clearOverride: true
	},
	attachments: {
		agentListAttachments: true,

		initiate: true,
		complete: true,
		completeForTodo: true,
		list: true,
		listForTodo: true,
		listForProject: true,
		downloadById: true,
		retry: true,
		removeById: true,
		download: true,
		read: true,
		remove: true
	},
	deliverables: {
		agentExportDocument: true,
		agentListArtifacts: true,
		agentListTemplates: true,
		agentGetExportSettings: true,
		agentUpdateExportSettings: true,
		agentGetArtifact: true,
		agentDownloadArtifact: true,
		agentDeleteArtifact: true,
		agentRegenerateArtifact: true,

		synchronize: true,
		initiateTemplateUpload: true,
		completeTemplateUpload: true,
		listTemplates: true,
		deleteTemplate: true,
		generateDocument: true,
		generateBundle: true,
		previewDocument: true,
		getExportSettings: true,
		updateExportSettings: true,
		listArtifacts: true,
		getArtifact: true,
		downloadArtifact: true,
		deleteArtifact: true,
		regenerateArtifact: true
	},
	trustPolicies: {
		agentListTrustPolicies: true,
		agentUpdateTrustPolicy: true,

		synchronize: true,
		list: true,
		update: true
	},
	memory: {
		agentListProjectMemory: true,
		agentListUserMemory: true,
		agentProposeMemoryChange: true,

		synchronize: true,
		list: true,
		create: true,
		update: true,
		remove: true,
		propose: true
	},
	widgets: {
		agentReadWidgetCatalog: true,
		agentCreateWidget: true,
		agentListWidgets: true,
		agentReadWidget: true,
		agentEditWidgetData: true,
		agentEditWidgetLayout: true,

		synchronize: true,
		get: true,
		catalog: true,
		list: true,
		create: true,
		edit: true,
		archive: true,
		restore: true,
		delete: true
	},
	retrieval: {
		agentSearch: true,
		agentSearchNote: true,

		search: true
	},
	inlineSuggestions: {
		suggest: true
	},
	feedback: {
		submit: true
	}
} satisfies {
	[K in keyof ControllerFactory]: ControllerSurface<ReturnType<ControllerFactory[K]>>;
};

export const agentToolAuthoritySurface = {
	approvalRequired: false,
	select: false,
	appPlan: false,
	mcpPlan: false,
	offered: false,
	available: false,
	authorize: false,
	isEnabled: false,
	discover: true,
	catalog: false
} satisfies ControllerSurface<import('../controllers/agent/tool-authority').AgentToolAuthority>;
export const agentToolSessionSurface = { authority: true } satisfies ControllerSurface<
	import('../controllers/agent/tool-sessions').AgentToolSessionControl
>;

export const localIdentitySurface = { initializeLocal: true } satisfies ControllerSurface<
	import('../controllers/identity/local').LocalIdentityController
>;
