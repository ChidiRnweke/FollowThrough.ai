import type { Lab } from '../lab/application';

/**
 * A case is declared as data so that every case in the app can be registered
 * into a single Phoenix suite.
 *
 * This matters because of how the client syncs: `createDataset` posts
 * `action: "update"`, which replaces the dataset's current version with exactly
 * the examples posted. Two `px.describe` blocks sharing a `datasetName`
 * therefore clobber each other — the dataset ends up holding only whichever
 * suite initialised last. One suite, many cases, sliced by `splits`, is the only
 * shape that gives a single accumulating dataset for the app.
 *
 * `splits` are what make that dataset navigable: they carry the archetype, so
 * the Phoenix UI can filter to `tool_calling` or `regression` without needing a
 * dataset per capability.
 */
export interface EvalCase {
	/** Stable id; used to upsert the dataset example across runs. */
	readonly id: string;
	/** Human-readable case name, shown as the test name. */
	readonly name: string;
	/** Archetypes and tags this case belongs to. */
	readonly splits: readonly string[];
	/** Recorded as the dataset example's input. */
	readonly input: Record<string, unknown>;
	/** Recorded as the dataset example's reference output. */
	readonly expected: Record<string, unknown>;
	readonly metadata?: Record<string, unknown>;
	/**
	 * Executes the case: seeds its fixture, runs the agent, logs output and
	 * capability annotations, and asserts the hard invariants.
	 */
	run(lab: Lab): Promise<void>;
}

/** Archetype names, kept in one place so splits and annotations cannot drift apart. */
export const ARCHETYPES = {
	toolCalling: 'tool_calling',
	toolDiscovery: 'tool_discovery',
	/** Can the catalog surface the right tool at all, independent of the model? */
	toolRetrieval: 'tool_retrieval_at_k',
	/** Does the agent reach for the catalog when the capability is not in hand? */
	toolSearchTrigger: 'tool_search_trigger',
	/** Are the arguments it dispatches actually usable? */
	toolPayload: 'tool_payload_validity',
	diagramQuality: 'diagram_quality',
	/** Did the requested change actually land in committed state? */
	effect: 'effect_applied',
	memoryAdherence: 'memory_adherence',
	memoryPrecedence: 'memory_precedence',
	memoryCapture: 'memory_capture',
	injectionResistance: 'injection_resistance',
	approvalCompliance: 'approval_compliance',
	retrieval: 'retrieval_precision_at_1',
	/** Does the agent use scoped context (projectId, noteId) to select the right tools/args? */
	contextAwareness: 'context_awareness',
	/** Does the agent chain multiple tools in the correct order for composite tasks? */
	multiStep: 'multi_step',
	/** Does the agent load and follow skill instructions? */
	skillAdherence: 'skill_adherence',
	/** Does the agent stop without over-calling or looping? */
	stoppingBehavior: 'stopping_behavior',
	/** Does the agent dispatch selection-scoped tools when a selection is present? */
	selectionHandling: 'selection_handling',
	/** Can the agent decompose vague, multi-intent user speech into a reasonable tool plan? */
	intentInterpretation: 'intent_interpretation',
	/** Does the agent pass the correct object ID when multiple plausible targets exist? */
	targetCorrectness: 'target_correctness',
	/** Is proactive ghost text a clean continuation: no preamble, no echo, short? */
	inlineSuggestionShape: 'inline_suggestion_shape',
	/** Does the briefing pass ground ghost text in memory the passage never states? */
	inlineGrounding: 'inline_grounding'
} as const;
