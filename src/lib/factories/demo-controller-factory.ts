import type {
	AgentEvent,
	CreateNoteInput,
	DrawioDiagram,
	GetNoteViewInput,
	MermaidDiagram,
	Note,
	NoteId,
	Project,
	Suggestion,
	TodoListFilter,
	UpdateTodoInput,
	UpdateTrustPolicyInput
} from '../models';
import type {
	AgentController,
	DiagramsController,
	ProjectsController,
	NotesController,
	ReferencesController,
	RelationshipsController,
	SkillsController,
	SuggestionsController,
	TodosController,
	TrustPoliciesController,
	WorkspaceController
} from '../controllers';
import type { ControllerFactory } from './controller-factory';
import { demoIds, demoNote, demoNow, demoSuggestion, demoTodo } from './demo-fixtures';
import {
	demoNoteViews,
	demoShellContext,
	demoSkillSummaries,
	demoSkillView,
	demoSuggestionGroups,
	demoTodayView,
	demoTodoViews,
	demoTrustPolicies,
	demoUser
} from '../demo';

export type DemoScenario = 'default' | 'empty' | 'error';
const fail = (): never => {
	throw new Error('Demo scenario failure');
};
const suggestions = (scenario: DemoScenario): readonly Suggestion[] =>
	scenario === 'empty' ? [] : [demoSuggestion];
const mermaid: MermaidDiagram = {
	id: demoIds.diagram,
	userId: demoIds.user,
	noteId: demoIds.note,
	kind: 'mermaid',
	source: 'flowchart LR; A-->B',
	searchableText: 'A B',
	renderedSvg: '<svg></svg>',
	createdAt: demoNow,
	updatedAt: demoNow
};
const drawio: DrawioDiagram = {
	...mermaid,
	kind: 'drawio',
	source: '<mxfile />',
	promotedFromId: demoIds.diagram
};
const demoProject: Project = {
	id: demoIds.project,
	userId: demoIds.user,
	name: 'Architecture workbench',
	description: 'Demo project',
	createdAt: demoNow,
	updatedAt: demoNow
};

export class DemoControllerFactory implements ControllerFactory {
	constructor(private readonly scenario: DemoScenario = 'default') {}
	relationships(): RelationshipsController {
		return {
			suggestFromSelection: async () => {
				if (this.scenario === 'error') fail();
				return { anchorId: demoIds.anchor, suggestions: suggestions(this.scenario) };
			}
		};
	}
	references(): ReferencesController {
		return {
			suggestFromSelection: async () => {
				if (this.scenario === 'error') fail();
				return this.scenario === 'empty'
					? { outcome: 'nothing_relevant' as const, anchorId: demoIds.anchor }
					: { outcome: 'found' as const, anchorId: demoIds.anchor, suggestions: [demoSuggestion] };
			}
		};
	}
	diagrams(): DiagramsController {
		return {
			generateMermaid: async () => {
				if (this.scenario === 'error') fail();
				return { anchorId: demoIds.anchor, suggestion: demoSuggestion };
			},
			reviseMermaid: async () => {
				if (this.scenario === 'error') fail();
				return { diagram: mermaid };
			},
			promote: async () => {
				if (this.scenario === 'error') fail();
				return { source: mermaid, promoted: drawio };
			}
		};
	}
	agent(): AgentController {
		const scenario = this.scenario;
		return {
			listSessions: async () => [],
			getSession: async () => fail(),
			async *run(): AsyncIterable<AgentEvent> {
				if (scenario === 'error') fail();
				if (scenario === 'empty') return;
				yield { type: 'text_delta', text: 'Draft ready.' };
				yield { type: 'suggestion', suggestion: demoSuggestion };
				yield {
					type: 'completed',
					conversationId: '00000000-0000-4000-8000-000000000008' as never
				};
			}
		};
	}
	workspace(): WorkspaceController {
		return {
			getShellContext: async () => {
				if (this.scenario === 'error') fail();
				return this.scenario === 'empty'
					? { user: demoUser, noteTree: [], pendingSuggestionCount: 0 }
					: demoShellContext;
			},
			getTodayView: async () => {
				if (this.scenario === 'error') fail();
				return this.scenario === 'empty'
					? {
							overdue: [],
							dueToday: [],
							waitingOn: [],
							pendingSuggestionCount: 0,
							pinnedNotes: [],
							recentNotes: []
						}
					: demoTodayView;
			}
		};
	}
	notes(): NotesController {
		return {
			get: async (_actor: unknown, input: GetNoteViewInput) => {
				if (this.scenario === 'error') fail();
				const fallback = {
					note: demoNote,
					backlinks: [],
					references: [],
					diagrams: [],
					todos: [],
					pendingSuggestions: []
				};
				if (this.scenario === 'empty') return fallback;
				return demoNoteViews.get(input.noteId) ?? fallback;
			},
			create: async (_actor: unknown, input: CreateNoteInput) => {
				if (this.scenario === 'error') fail();
				const note: Note = {
					...demoNote,
					id: crypto.randomUUID() as NoteId,
					title: input.title,
					isPinned: false,
					plainText: '',
					...(input.parentId !== undefined ? { parentId: input.parentId } : {})
				};
				return { note };
			},
			save: async () => {
				if (this.scenario === 'error') fail();
				return {
					note: demoNote,
					repairedAnchorIds: this.scenario === 'empty' ? [] : [demoIds.anchor]
				};
			}
		};
	}
	todos(): TodosController {
		return {
			list: async (_actor: unknown, filter: TodoListFilter) => {
				if (this.scenario === 'error') fail();
				if (this.scenario === 'empty') return { todos: [] };
				return {
					todos: demoTodoViews.filter(
						(view) =>
							(filter.status === undefined || view.todo.status === filter.status) &&
							(filter.responsibility === undefined ||
								view.todo.responsibility === filter.responsibility) &&
							(filter.noteId === undefined || view.anchor?.noteId === filter.noteId) &&
							(filter.dueBefore === undefined ||
								(view.todo.dueDate !== undefined && view.todo.dueDate <= filter.dueBefore))
					)
				};
			},
			update: async (_actor: unknown, input: UpdateTodoInput) => {
				if (this.scenario === 'error') fail();
				const current =
					demoTodoViews.find((view) => view.todo.id === input.todoId)?.todo ?? demoTodo;
				return {
					todo: {
						...current,
						...(input.status !== undefined ? { status: input.status } : {}),
						...(input.title !== undefined ? { title: input.title } : {}),
						...(input.description !== undefined ? { description: input.description } : {}),
						...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
						updatedAt: demoNow
					}
				};
			},
			extractPromises: async () => {
				if (this.scenario === 'error') fail();
				return {
					anchorId: demoIds.anchor,
					suggestions: suggestions(this.scenario),
					createdTodos: this.scenario === 'empty' ? [] : [demoTodo]
				};
			}
		};
	}
	skills(): SkillsController {
		return {
			list: async () => {
				if (this.scenario === 'error') fail();
				return { skills: this.scenario === 'empty' ? [] : demoSkillSummaries };
			},
			get: async () => {
				if (this.scenario === 'error') fail();
				return this.scenario === 'empty'
					? { skill: demoSkillView.skill, usages: [] }
					: demoSkillView;
			},
			createFromSelection: async () => {
				if (this.scenario === 'error') fail();
				return { skillNoteId: demoIds.note };
			}
		};
	}
	suggestions(): SuggestionsController {
		return {
			list: async () => {
				if (this.scenario === 'error') fail();
				return { groups: this.scenario === 'empty' ? [] : demoSuggestionGroups };
			},
			accept: async () => {
				if (this.scenario === 'error') fail();
				return {
					suggestion: { ...demoSuggestion, status: 'accepted' as const },
					artifact: demoTodo
				};
			},
			reject: async () =>
				this.scenario === 'error' ? fail() : { ...demoSuggestion, status: 'rejected' as const },
			revert: async () =>
				this.scenario === 'error' ? fail() : { ...demoSuggestion, status: 'reverted' as const }
		};
	}
	trustPolicies(): TrustPoliciesController {
		return {
			list: async () => {
				if (this.scenario === 'error') fail();
				return { policies: this.scenario === 'empty' ? [] : demoTrustPolicies };
			},
			update: async (_actor: unknown, input: UpdateTrustPolicyInput) => {
				if (this.scenario === 'error') fail();
				const current =
					demoTrustPolicies.find((policy) => policy.pipeline === input.pipeline) ??
					demoTrustPolicies[0]!;
				return {
					policy: {
						...current,
						autoAcceptEnabled: input.autoAcceptEnabled,
						...(input.minimumConfidence !== undefined
							? { minimumConfidence: input.minimumConfidence }
							: {}),
						updatedAt: demoNow
					}
				};
			}
		};
	}
	projects(): ProjectsController {
		return {
			list: async () => ({ projects: this.scenario === 'empty' ? [] : [demoProject] }),
			get: async () => ({
				project: demoProject,
				tree: this.scenario === 'empty' ? [] : [{ entry: { ...demoNote }, children: [] }]
			}),
			create: async (_actor, input) => ({ project: { ...demoProject, name: input.name } }),
			rename: async (_actor, input) => ({
				project: { ...demoProject, name: input.name, description: input.description }
			}),
			archive: async () => ({ project: { ...demoProject, archivedAt: demoNow } }),
			createFolder: async (_actor, input) => ({
				folder: {
					...demoNote,
					id: crypto.randomUUID() as NoteId,
					projectId: input.projectId,
					parentId: input.parentId,
					kind: 'folder',
					title: input.name,
					document: { type: 'doc', content: [] },
					plainText: '',
					isPinned: false
				}
			}),
			move: async (_actor, input) => ({
				entry: { ...demoNote, parentId: input.parentId, position: input.position }
			})
		};
	}
}
