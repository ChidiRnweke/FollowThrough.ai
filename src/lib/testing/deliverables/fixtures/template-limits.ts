import type { TemplateAdmissionLimits } from '$lib/models/deliverables';

/** Template admission at the deployment defaults (25 MiB, 25 MiB, 2000), narrowed per test. */
export const templateLimitsFixture = (
	overrides: Partial<TemplateAdmissionLimits> = {}
): TemplateAdmissionLimits => ({
	maxBytes: 25 * 1024 * 1024,
	maxExpandedBytes: 25 * 1024 * 1024,
	maxEntries: 2000,
	...overrides
});
