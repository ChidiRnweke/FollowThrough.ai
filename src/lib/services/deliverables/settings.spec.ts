import { describe, expect, it } from 'vitest';
import { ExportSettingsRuleService } from './settings';
import { ValidationError } from '$lib/errors';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
const settings = (overrides: Partial<ExportSettings>): ExportSettings => ({
	...defaultExportSettings,
	...overrides
});
describe('export settings validation', () => {
	it('rejects a font size outside the supported range', () => {
		const rules = new ExportSettingsRuleService();
		expect(() => rules.validate(settings({ fontSize: 19 }))).toThrowError(ValidationError);
	});

	it('rejects a line height outside the supported range', () => {
		const rules = new ExportSettingsRuleService();
		expect(() => rules.validate(settings({ lineHeight: 0.9 }))).toThrowError(ValidationError);
	});

	it('rejects a page margin outside the supported range', () => {
		const rules = new ExportSettingsRuleService();
		expect(() => rules.validate(settings({ margin: 145 }))).toThrowError(ValidationError);
	});
});
