import { Proofreading, type ProofreadingController } from '$lib/controllers/notes/proofreading';
import { ProofreadingStore } from '$lib/stores/notes/proofreading.svelte';
import { ProofreadingRulesService } from '$lib/services/proofreading/rules';
import { BrowserProofreadingPreferences } from '$lib/client/proofreading/preferences';
import { HarperLinter } from '$lib/client/proofreading/harper-linter';
export const proofreading: ProofreadingController = new Proofreading(
	new ProofreadingStore(),
	new BrowserProofreadingPreferences(),
	new ProofreadingRulesService(),
	() => new HarperLinter()
);
