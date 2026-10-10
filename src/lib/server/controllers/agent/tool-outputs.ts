import { type ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import type { ArtifactId } from '$lib/models/deliverables';
import type { DiagramId } from '$lib/models/diagrams';
import type { ApiTokenId } from '$lib/models/identity';
import type { NoteEtag, NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { type WidgetId } from '$lib/models/widgets';
import type { AgentFilesController } from '$lib/server/controllers/agent-files/controller';
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
import type {
	MemoryProjection,
	NoteRevisionProjection,
	NoteViewProjection,
	NoteWriteProjection,
	ProjectProjection,
	SkillViewProjection,
	SuggestionProjection,
	TodoProjection,
	TodoWriteProjection,
	UserProjection
} from '$lib/models/agent-tool-views';
type ControllerResult<Method> = Method extends (...args: never[]) => Promise<infer Output>
	? Output
	: never;
interface AgentToolOutputMap {
	readonly ls:
		Exclude<ControllerResult<AgentFilesController['ls']>, { kind: 'error' }> | ToolFailure;
	readonly grep:
		Exclude<ControllerResult<AgentFilesController['grep']>, { kind: 'error' }> | ToolFailure;
	readonly sed:
		Exclude<ControllerResult<AgentFilesController['sed']>, { kind: 'error' }> | ToolFailure;
	readonly search: ControllerResult<RetrievalController['search']>;
	readonly search_note: ControllerResult<RetrievalController['search']>;
	readonly get_workspace_context: {
		readonly user: UserProjection;
		readonly projects: readonly ProjectProjection[];
		readonly noteTree: readonly import('$lib/models/agent-tool-views').NoteSummaryProjection[];
		readonly skills: ControllerResult<WorkspaceController['getShellContext']>['skills'];
		readonly pendingSuggestionCount: number;
	};
	readonly get_today_view: ControllerResult<WorkspaceController['getTodayView']>;
	readonly list_projects: { readonly projects: readonly ProjectProjection[] };
	readonly get_project: ControllerResult<ProjectsController['get']>;
	readonly create_project: ProjectProjection;
	readonly rename_project: ProjectProjection;
	readonly archive_project: ProjectProjection;
	readonly create_folder: NoteWriteProjection;
	readonly move_project_entry: ControllerResult<ProjectsController['move']>;
	readonly get_note: NoteViewProjection;
	readonly create_note: NoteWriteProjection;
	readonly save_note: NoteWriteProjection | ToolFailure;
	readonly edit_note:
		| ToolFailure
		| NoteWriteProjection
		| (NoteWriteProjection & {
				readonly appliedEdits: number;
				readonly matchedTexts: readonly string[];
		  });
	readonly rename_note: NoteWriteProjection;
	readonly archive_note: NoteWriteProjection;
	readonly restore_note: NoteWriteProjection;
	readonly list_trashed_notes: ControllerResult<NotesController['listTrash']>;
	readonly delete_note_forever: ControllerResult<NotesController['deleteForever']>;
	readonly empty_note_trash: ControllerResult<NotesController['emptyTrash']>;
	readonly list_note_versions: ControllerResult<NotesController['listRevisions']>;
	readonly diff_note_versions: ControllerResult<NotesController['compareRevisions']>;
	readonly restore_note_version: NoteWriteProjection & { readonly etag: NoteEtag };
	readonly publish_note: NoteWriteProjection & { readonly etag: NoteEtag };
	readonly discard_note_draft: ControllerResult<NotesController['discardDraft']>;
	readonly list_todos: { readonly todos: readonly TodoProjection[] };
	readonly create_todo: TodoWriteProjection;
	readonly create_todos: { readonly todos: readonly TodoWriteProjection[] };
	readonly update_todo: TodoWriteProjection;
	readonly revise_mermaid_diagram: ControllerResult<DiagramsController['reviseMermaid']>;
	readonly search_icons: ControllerResult<DiagramStudioController['searchDiagramIcons']>;
	readonly read_project_diagram: {
		readonly id: DiagramId;
		readonly kind: 'mermaid' | 'drawio';
		readonly title?: string;
		readonly labels: string;
		readonly path: string;
	};
	readonly promote_diagram: ControllerResult<DiagramsController['promote']>;
	readonly list_suggestions: { readonly suggestions: readonly SuggestionProjection[] };
	readonly accept_suggestion: ControllerResult<SuggestionsController['acceptReviewed']>;
	readonly reject_suggestion: ControllerResult<SuggestionsController['reject']>;
	readonly revert_suggestion: ControllerResult<SuggestionsController['revert']>;
	readonly list_skills: ControllerResult<SkillsController['list']>;
	readonly save_skill: AgentToolOutputMap['save_note'];
	readonly edit_skill: AgentToolOutputMap['edit_note'];
	readonly create_skill: ControllerResult<SkillsController['create']>;
	readonly list_skill_versions: { readonly revisions: readonly NoteRevisionProjection[] };
	readonly restore_skill_version: ControllerResult<SkillsController['restoreVersion']>;
	readonly update_skill: ControllerResult<SkillsController['update']>;
	readonly set_skill_pinned: {
		readonly noteId: NoteId;
		readonly projectId: ProjectId;
		readonly pinned: boolean;
	};
	readonly list_api_tokens: ControllerResult<ApiTokensController['list']>;
	readonly revoke_api_token: {
		readonly tokenId: ApiTokenId;
		readonly name: string;
		readonly revoked: true;
	};
	readonly list_attachments: ControllerResult<AttachmentsController['list']>;
	readonly list_project_memory: { readonly entries: readonly MemoryProjection[] };
	readonly list_user_memory: { readonly entries: readonly MemoryProjection[] };
	readonly propose_memory_change: ControllerResult<MemoryController['propose']>;
	readonly list_trust_policies: ControllerResult<TrustPoliciesController['list']>;
	readonly update_trust_policy: ControllerResult<TrustPoliciesController['update']>;
	readonly list_tool_preferences: ControllerResult<ToolPreferencesController['list']>;
	readonly set_tool_enabled: ControllerResult<ToolPreferencesController['setEnabled']>;
	readonly get_agent_preferences: ControllerResult<AgentSettingsController['getPreferences']>;
	readonly update_agent_preferences: ControllerResult<
		AgentSettingsController['updatePreferences']
	> & {
		readonly previous: ControllerResult<AgentSettingsController['getPreferences']>;
	};
	readonly list_agent_models: ControllerResult<AgentSettingsController['listModels']>;
	readonly export_document: ControllerResult<DeliverablesController['generateDocument']>;
	readonly list_artifacts: ControllerResult<DeliverablesController['listArtifacts']>;
	readonly list_templates: ControllerResult<DeliverablesController['listTemplates']>;
	readonly get_export_settings: ControllerResult<DeliverablesController['getExportSettings']>;
	readonly update_export_settings: ControllerResult<DeliverablesController['updateExportSettings']>;
	readonly get_artifact: NonNullable<ControllerResult<DeliverablesController['getArtifact']>>;
	readonly download_artifact: ControllerResult<DeliverablesController['downloadArtifact']>;
	readonly delete_artifact: {
		readonly artifactId: ArtifactId;
		readonly title: string;
		readonly deleted: true;
	};
	readonly regenerate_artifact: ControllerResult<DeliverablesController['regenerateArtifact']>;
	readonly extract_promises: ControllerResult<TodosController['extractPromises']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly relate_selection: ControllerResult<RelationshipsController['suggestFromSelection']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly find_references: ControllerResult<ReferencesController['suggestFromSelection']> & {
		readonly sourceNoteId: NoteId;
	};
	readonly create_skill_from_selection: ControllerResult<
		SkillsController['createFromSelection']
	> & { readonly sourceNoteId: NoteId };
	readonly load_skill: SkillViewProjection;
	readonly create_diagram: ControllerResult<DiagramStudioController['createDiagram']>;
	readonly edit_diagram: ControllerResult<DiagramStudioController['editDiagram']>;
	readonly read_canvas_diagram: ControllerResult<DiagramStudioController['readCanvasDiagram']>;
	readonly read_widget_catalog: ControllerResult<WidgetsController['catalog']>;
	readonly create_widget: {
		readonly widgetId: WidgetId;
		readonly title: string;
		readonly embed: string;
		readonly nextActions: readonly [
			{ readonly tool: 'edit_note'; readonly noteId?: NoteId; readonly reason: string }
		];
	};
	readonly list_widgets: {
		readonly widgets: readonly {
			readonly widgetId: WidgetId;
			readonly title: string;
			readonly updatedAt: string;
		}[];
	};
	readonly read_widget: ControllerResult<WidgetsController['get']>;
	readonly edit_widget_data: ControllerResult<WidgetsController['edit']>;
	readonly edit_widget_layout: ControllerResult<WidgetsController['edit']>;
}
export type AgentToolOutput<Name extends ToolName> = AgentToolOutputMap[Name];
type Total<T extends never> = T;
type _OutputMapCoversCatalog = Total<Exclude<ToolName, keyof AgentToolOutputMap>>;
type _OutputMapNamesNothingElse = Total<Exclude<keyof AgentToolOutputMap, ToolName>>;
