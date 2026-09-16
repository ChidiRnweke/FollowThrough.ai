import { describe, expect, it } from 'vitest';
import { defaultExportSettings, exportSettingsSchema } from './index';

describe('export settings requests', () => {
	it('preserves the selected diagram palette at the request boundary', () => {
		const settings = {
			...defaultExportSettings,
			includeTitle: true,
			diagramTheme: { base: 'dark', colors: { primaryColor: '#123456' } }
		};
		expect(exportSettingsSchema.parse(settings)).toEqual(settings);
	});
	it('keeps title visibility independent of a diagram palette', () => {
		expect(
			exportSettingsSchema.parse({
				fontFamily: 'times',
				fontSize: 12,
				lineHeight: 1.5,
				margin: 72,
				includeTitle: false
			})
		).toEqual({
			fontFamily: 'times',
			fontSize: 12,
			lineHeight: 1.5,
			margin: 72,
			includeTitle: false
		});
	});
	it('rejects a font size outside the product range', () => {
		expect(exportSettingsSchema.safeParse({ ...defaultExportSettings, fontSize: 19 }).success).toBe(
			false
		);
	});
	it('rejects an unsupported diagram palette base', () => {
		expect(
			exportSettingsSchema.safeParse({ ...defaultExportSettings, diagramTheme: { base: 'sepia' } })
				.success
		).toBe(false);
	});
});
