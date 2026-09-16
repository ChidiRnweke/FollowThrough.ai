import { expect, it } from 'vitest';
import { Feedback, type FeedbackDependencies } from './controller';
import type { FeedbackReport } from '$lib/models/feedback';
import { InMemoryFeedbackReports } from '$lib/testing/feedback/fakes/in-memory-reports';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { appContextBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const reports = new InMemoryFeedbackReports();
	const controller = new Feedback(capabilityDependencies<FeedbackDependencies>({ reports }));
	const report: FeedbackReport = {
		body: 'The editor stopped saving',
		url: '/today',
		appContext: appContextBuilder({ surface: { kind: 'today', presentation: 'full_page' } })
	};
	return { reports, controller, report };
};

it('stores feedback with its authenticated account and captured screen context', async () => {
	const { reports, controller, report } = setup();
	await controller.submit(testActor(), report);
	expect(reports.reports).toEqual([{ userId: testActor().userId, report }]);
});

it('reports a storage failure to the submitter instead of claiming feedback was sent', async () => {
	const { reports, controller, report } = setup();
	reports.failure = new Error('Feedback storage is unavailable');
	await expect(controller.submit(testActor(), report)).rejects.toThrow(
		'Feedback storage is unavailable'
	);
});

it('stores one report when the user retries after a failed submission', async () => {
	const { reports, controller, report } = setup();
	reports.failure = new Error('Feedback storage is unavailable');
	await controller.submit(testActor(), report).catch(() => ({ kind: 'failure' as const }));
	reports.failure = null;
	await controller.submit(testActor(), report);
	expect(reports.reports).toEqual([{ userId: testActor().userId, report }]);
});
