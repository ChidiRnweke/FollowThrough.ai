import type { ControllerFactory } from './controller-factory';
import type { ControllerSurface } from '../controllers/instrumentation';

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
		recoverQueuedPromiseRuns: true
	},
	relationships: {
		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeRelatedNoteRun: true,
		recoverQueuedRelatedNoteRuns: true
	},
	references: {
		suggestFromSelection: true,
		startSuggestFromSelection: true,
		executeReferenceRun: true,
		recoverQueuedReferenceRuns: true
	},
	diagrams: {
		generateMermaid: true,
		reviseMermaid: true,
		reviseInlineMermaid: true,
		convertInlineMermaid: true,
		getDrawio: true,
		saveDrawio: true,
		promote: true,
		startGenerateMermaid: true,
		startReviseInlineMermaid: true,
		startConvertInlineMermaid: true,
		executeDiagramRun: true,
		recoverQueuedDiagramRuns: true
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
		saveProjectDrawio: true,
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
		loadForAgent: true,
		create: true,
		createFromSelection: true,
		listVersions: true,
		restoreVersion: true,
		update: true,
		serialize: true,
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
		synchronize: true,
		getPreferences: true,
		updatePreferences: true,
		listModels: true,
		resolveDefaults: true,
		deploymentDefaults: true
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
	retrieval: {
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
