import { describe, expect, it } from 'vitest';
import { ArtifactLibrary } from './artifacts';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
import { InMemoryArtifactRepository } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryExportSettingsRepository } from '$lib/testing/deliverables/fakes/in-memory-export-settings-repository';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () =>
	new ArtifactLibrary(new InMemoryArtifactRepository(), new InMemoryExportSettingsRepository());
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

	it('rejects a font size outside the supported range', async () => {
		const service = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ fontSize: 19 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a line height outside the supported range', async () => {
		const service = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ lineHeight: 0.9 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a page margin outside the supported range', async () => {
		const service = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ margin: 145 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});
