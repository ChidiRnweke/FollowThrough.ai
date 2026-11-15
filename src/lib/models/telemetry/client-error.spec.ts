import { expect, it } from 'vitest';
import { clientErrorReportSchema } from './client-error';

it('accepts only HTTP status codes and the fields the browser sends', () => {
	const accepts = (report: object) => clientErrorReportSchema.safeParse(report).success;
	expect({
		lowest: accepts({ message: 'failed', status: 100 }),
		highest: accepts({ message: 'failed', status: 599 }),
		below: accepts({ message: 'failed', status: 99 }),
		above: accepts({ message: 'failed', status: 600 }),
		unknownField: accepts({ message: 'failed', extra: 'x'.repeat(1000) })
	}).toEqual({ lowest: true, highest: true, below: false, above: false, unknownField: false });
});
