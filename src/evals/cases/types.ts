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
	memoryAdherence: 'memory_adherence',
	memoryPrecedence: 'memory_precedence',
	memoryCapture: 'memory_capture',
	injectionResistance: 'injection_resistance',
	approvalCompliance: 'approval_compliance',
	retrieval: 'retrieval_precision_at_1'
} as const;
