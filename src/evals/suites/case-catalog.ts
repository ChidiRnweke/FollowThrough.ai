import type { EvalCase } from '../cases/types';
import { toolCallingCases } from '../cases/tool-calling';
import { toolRetrievalCases } from '../cases/tool-retrieval';
import { toolInvocationCases, toolSearchTriggerCases } from '../cases/tool-invocation';
import { memoryCases } from '../cases/memory';
import { safetyCases } from '../cases/safety';
import { diagramCases } from '../cases/diagrams';
import { effectCases } from '../cases/effects';
import { noteEditingCases } from '../cases/note-editing';
import { retrievalCases } from '../cases/retrieval';
import { groundingCases } from '../cases/grounding';
import { contextAwarenessCases } from '../cases/context-awareness';
import { multiStepCases } from '../cases/multi-step';
import { skillAdherenceCases } from '../cases/skill-adherence';
import { selectionCases } from '../cases/selection';
import { stoppingCases } from '../cases/stopping';
import { intentInterpretationCases } from '../cases/intent-interpretation';
import { correctnessCases } from '../cases/correctness';
import { multiTurnCorrectnessCases } from '../cases/multi-turn-correctness';
import { inlineSuggestionCases } from '../cases/inline-suggestion';
import { timeAwarenessCases, parallelExecutionCases } from '../cases/time-awareness';
import { completionRegressionCases } from '../cases/completion';

export const EVAL_SECTIONS = {
	'tool-retrieval': toolRetrievalCases,
	retrieval: retrievalCases,
	'tool-calling': toolCallingCases,
	stopping: stoppingCases,
	'tool-invocation': [...toolInvocationCases, ...toolSearchTriggerCases],
	'context-awareness': contextAwarenessCases,
	grounding: groundingCases,
	memory: memoryCases,
	'skill-adherence': skillAdherenceCases,
	selection: selectionCases,
	'multi-step': multiStepCases,
	safety: safetyCases,
	diagrams: diagramCases,
	effects: effectCases,
	'note-editing': noteEditingCases,
	correctness: correctnessCases,
	'time-awareness': [...timeAwarenessCases, ...parallelExecutionCases],
	'inline-suggestion': inlineSuggestionCases,
	'intent-interpretation': intentInterpretationCases,
	'multi-turn-correctness': multiTurnCorrectnessCases,
	completion: completionRegressionCases
} satisfies Record<string, readonly EvalCase[]>;

export type EvalSection = keyof typeof EVAL_SECTIONS;

export const ALL_EVAL_CASES: readonly EvalCase[] = Object.values(EVAL_SECTIONS).flat();

/** Smoke is intentionally explicit: substring filters made "completion" select costly cases. */
export const SMOKE_CASE_IDS = new Set([
	'tool-retrieval-todos-create',
	'retrieval-postgres-failover',
	'effect-todo-persisted',
	'note-surgical-edit-requires-edit-note'
]);

export interface EvalSelection {
	readonly profile?: string;
	readonly section?: string;
	readonly caseId?: string;
}

export function selectEvalCases(selection: EvalSelection): readonly EvalCase[] {
	const { profile, section, caseId } = selection;
	if (section && !(section in EVAL_SECTIONS)) {
		throw new Error(
			`Unknown EVAL_SECTION "${section}". Expected one of: ${Object.keys(EVAL_SECTIONS).join(', ')}`
		);
	}
	if (caseId && !ALL_EVAL_CASES.some((evalCase) => evalCase.id === caseId)) {
		throw new Error(`Unknown EVAL_CASE "${caseId}".`);
	}

	let selected =
		profile === 'smoke'
			? ALL_EVAL_CASES.filter((item) => SMOKE_CASE_IDS.has(item.id))
			: ALL_EVAL_CASES;
	if (section)
		selected = selected.filter((item) => EVAL_SECTIONS[section as EvalSection].includes(item));
	if (caseId) selected = selected.filter((item) => item.id === caseId);
	if (selected.length === 0) {
		throw new Error(
			`Eval selection matched zero cases (profile=${profile ?? 'exploratory'}, section=${section ?? '*'}, case=${caseId ?? '*'}).`
		);
	}
	return selected;
}
