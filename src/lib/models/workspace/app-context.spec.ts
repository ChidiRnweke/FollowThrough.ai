import { describe, expect, it } from 'vitest';
import { appContextSnapshotV1Schema } from './app-context';

const validSnapshot = () => ({
	version: 1 as const,
	capturedAt: '2026-08-30T10:30:00.000Z',
	client: {
		locale: 'en-BE',
		timeZone: 'Europe/Brussels',
		localDate: '2026-08-30',
		layout: 'wide' as const
	},
	surface: { kind: 'note_workbench' as const, presentation: 'right_panel' as const },
	recentInteractions: []
});

describe('appContextSnapshotV1Schema', () => {
	it('accepts a complete versioned snapshot', () => {
		expect(appContextSnapshotV1Schema.safeParse(validSnapshot()).success).toBe(true);
	});

	it('rejects unknown top-level fields', () => {
		expect(
			appContextSnapshotV1Schema.safeParse({ ...validSnapshot(), arbitraryJson: true }).success
		).toBe(false);
	});

	it('rejects unknown nested fields', () => {
		expect(
			appContextSnapshotV1Schema.safeParse({
				...validSnapshot(),
				client: { ...validSnapshot().client, arbitraryJson: true }
			}).success
		).toBe(false);
	});

	it('rejects unsupported snapshot versions', () => {
		expect(appContextSnapshotV1Schema.safeParse({ ...validSnapshot(), version: 2 }).success).toBe(
			false
		);
	});

	it('rejects unrecognized pane sync states', () => {
		expect(
			appContextSnapshotV1Schema.safeParse({
				...validSnapshot(),
				workbench: {
					openTabs: [],
					visiblePanes: [
						{
							id: '10000000-0000-4000-8000-000000000001',
							title: 'Typed context',
							projectId: '20000000-0000-4000-8000-000000000002',
							revision: 1,
							syncStatus: 'whatever',
							dirty: false
						}
					]
				}
			}).success
		).toBe(false);
	});
});
