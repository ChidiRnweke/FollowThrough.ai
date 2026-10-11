import { expect, it } from 'vitest';
import { ExportPreparationService } from './export-preparation';
const preparation = new ExportPreparationService();

it.each([
	'<svg viewBox="0 0 100 50"/>',
	"<svg viewBox='0 0 100 50'/>",
	'<svg viewBox="0,0,100,50"/>',
	'<svg viewBox = "-1e1 +2e1 1e2 5e1"/>'
])('reads a valid SVG view box: %s', (svg) => {
	expect(preparation.diagramSize(svg)).toEqual({ width: 100, height: 50 });
});

it.each(['.. 0 100 50', '0,,0,100,50', '0 0 1e309 50', '0 0 -100 50', '0 0 0 50', '0 0 100 50 60'])(
	'declines an invalid view box: %s',
	(viewBox) => {
		expect(preparation.diagramSize(`<svg viewBox="${viewBox}"/>`)).toBeUndefined();
	}
);
