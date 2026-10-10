import type { ExportSettings } from '$lib/models/deliverables';
import { ValidationError } from '$lib/errors';
const validateSettings: (settings: ExportSettings) => ExportSettings = (
	settings: ExportSettings
): ExportSettings => {
	if (!['helvetica', 'times', 'courier'].includes(settings.fontFamily))
		throw new ValidationError('Unknown export font family');
	const within = (value: number, minimum: number, maximum: number): boolean =>
		Number.isFinite(value) && value >= minimum && value <= maximum;
	if (!within(settings.fontSize, 8, 18))
		throw new ValidationError('Export font size must be between 8 and 18 points');
	if (!within(settings.lineHeight, 1, 2.2))
		throw new ValidationError('Export line height must be between 1 and 2.2');
	if (!within(settings.margin, 18, 144))
		throw new ValidationError('Export margin must be between 18 and 144 points');
	return {
		fontFamily: settings.fontFamily,
		fontSize: settings.fontSize,
		lineHeight: settings.lineHeight,
		margin: settings.margin,
		...(settings.includeTitle === undefined ? {} : { includeTitle: settings.includeTitle }),
		...(settings.diagramTheme === undefined ? {} : { diagramTheme: settings.diagramTheme })
	};
};

export interface ExportSettingsRules {
	validate(settings: ExportSettings): ExportSettings;
}
export class ExportSettingsRuleService implements ExportSettingsRules {
	validate(settings: ExportSettings): ExportSettings {
		return validateSettings(settings);
	}
}
