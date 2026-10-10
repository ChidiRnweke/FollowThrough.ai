import { describe, expect, it } from 'vitest';
import { ArtifactSettingsService } from './artifacts';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
import { InMemoryExportSettingsRepository } from '$lib/testing/deliverables/fakes/in-memory-export-settings-repository';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => new ArtifactSettingsService(new InMemoryExportSettingsRepository());
const settings = (overrides: Partial<ExportSettings> = {}): ExportSettings => ({
	...defaultExportSettings,
	...overrides
});
describe('artifact settings behavior', () => {
	it('returns the product defaults before project settings are saved', async () => {
		const service = setup();
		expect(await service.getSettings(testActor(), testProjectId())).toEqual(defaultExportSettings);
	});

	it('persists valid project settings', async () => {
		const service = setup();
		const selected = settings({ fontFamily: 'times', fontSize: 12 });
		expect(await service.updateSettings(testActor(), testProjectId(), selected)).toEqual(selected);
	});
});
