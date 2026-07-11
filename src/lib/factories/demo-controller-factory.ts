import type { AgentEvent, DrawioDiagram, MermaidDiagram, Suggestion } from '../models';
import type { ControllerFactory } from './controller-factory';
import { demoIds, demoNote, demoNow, demoSuggestion, demoTodo } from './demo-fixtures';

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

export class DemoControllerFactory implements ControllerFactory {
	constructor(private readonly scenario: DemoScenario = 'default') {}
	extractPromises() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return {
					anchorId: demoIds.anchor,
					suggestions: suggestions(this.scenario),
					createdTodos: this.scenario === 'empty' ? [] : [demoTodo]
				};
			}
		};
	}
	relate() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return { anchorId: demoIds.anchor, suggestions: suggestions(this.scenario) };
			}
		};
	}
	reference() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return this.scenario === 'empty'
					? { outcome: 'nothing_relevant' as const, anchorId: demoIds.anchor }
					: { outcome: 'found' as const, anchorId: demoIds.anchor, suggestions: [demoSuggestion] };
			}
		};
	}
	generateMermaidDiagram() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return { anchorId: demoIds.anchor, suggestion: demoSuggestion };
			}
		};
	}
	reviseMermaidDiagram() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return { diagram: mermaid };
			}
		};
	}
	promoteDiagram() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return { source: mermaid, promoted: drawio };
			}
		};
	}
	acceptSuggestion() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return {
					suggestion: { ...demoSuggestion, status: 'accepted' as const },
					artifact: demoTodo
				};
			}
		};
	}
	rejectSuggestion() {
		return {
			execute: async () =>
				this.scenario === 'error' ? fail() : { ...demoSuggestion, status: 'rejected' as const }
		};
	}
	revertSuggestion() {
		return {
			execute: async () =>
				this.scenario === 'error' ? fail() : { ...demoSuggestion, status: 'reverted' as const }
		};
	}
	saveNote() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return {
					note: demoNote,
					repairedAnchorIds: this.scenario === 'empty' ? [] : [demoIds.anchor]
				};
			}
		};
	}
	runAgent() {
		const scenario = this.scenario;
		return {
			async *execute(): AsyncIterable<AgentEvent> {
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
	createSkillFromSelection() {
		return {
			execute: async () => {
				if (this.scenario === 'error') fail();
				return { skillNoteId: demoIds.note };
			}
		};
	}
}
