import type { ControllerSurface } from '$lib/models/controller-boundary';
import type { ControllerFactory } from './controller-factory';

/** The explicit public controller surface. Adding a capability requires declaring its boundary here. */
export const controllerSurfaces = {
	agentFiles: {
		ls: true,
		grep: true,
		sed: true
	},
	workspace: {
		pullChangePage: true,
		cancelMutation: true,
		readResource: true,
		getShellContext: true,
		getTodayView: true
	},
	projects: {
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
		importMarkdownArchive: true,
		prepareChange: true,
		applyReviewedChange: true,
		synchronize: true,
		get: true,
		setSectionNumbering: true,
		listDocuments: true,
		readDocument: true,
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
		resumeQueuedPromiseRun: true
	},
	relationships: {
		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeRelatedNoteRun: true,
		resumeQueuedRelatedNoteRun: true
	},
	references: {
		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeReferenceRun: true,
		resumeQueuedReferenceRun: true
	},
	diagrams: {
		generateMermaid: true,
		reviseMermaid: true,
		reviseInlineMermaid: true,
		convertInlineMermaid: true,
		promote: true,
		startGenerateMermaid: true,
		startReviseInlineMermaid: true,
		startConvertInlineMermaid: true,
		executeDiagramRun: true,
		resumeQueuedDiagramRun: true
	},
	diagramStudio: {
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
		list: true,
		listPendingMemory: true,
		accept: true,
		acceptReviewed: true,
		reject: true,
		revert: true
	},
	skills: {
		synchronize: true,
		list: true,
		get: true,
		use: true,
		create: true,
		createFromSelection: true,
		listVersions: true,
		restoreVersion: true,
		update: true,
		setPinned: true
	},
	agentHarness: {
		execute: true,
		openMcpTools: true,
		finishCancellation: true,
		failRun: true,
		recoverInterrupted: true,
		resumeQueued: true,
		synchronize: true,
		submit: true,
		getRun: true,
		observeRun: true,
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
		synchronize: true,
		getPreferences: true,
		updatePreferences: true,
		changePreferences: true,
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
		list: true,
		revoke: true
	},
	toolPreferences: {
		synchronize: true,
		list: true,
		setEnabled: true,
		clearOverride: true
	},
	attachments: {
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
		synchronize: true,
		list: true,
		update: true
	},
	memory: {
		synchronize: true,
		list: true,
		create: true,
		update: true,
		remove: true,
		propose: true
	},
	widgets: {
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
		search: true
	},
	inlineSuggestions: {
		suggest: true
	},
	feedback: {
		submit: true
	},
	contextUsage: {
		forProject: true
	},
	attachmentProcessing: {
		process: true
	},
	knowledgeIndexing: {
		backfill: true
	}
} satisfies {
	[K in keyof ControllerFactory]: ControllerSurface<ReturnType<ControllerFactory[K]>>;
};

export const localIdentitySurface = { initializeLocal: true } satisfies ControllerSurface<
	import('../controllers/identity/local').LocalIdentityController
>;
export const authenticationSurface = {
	resumeSession: true,
	endSession: true,
	verifyBearer: true
} satisfies ControllerSurface<
	import('../controllers/identity/authentication').AuthenticationController
>;
export const accessSurface = {
	issueApiToken: true,
	attributeMcp: true
} satisfies ControllerSurface<import('../controllers/identity/access').AccessController>;
