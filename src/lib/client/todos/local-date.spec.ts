import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

const moduleUrl = new URL('./local-date.ts', import.meta.url).href;

it.each([
	{ zone: 'America/Los_Angeles', instant: '2026-09-23T06:30:00Z', today: '2026-09-22' },
	{ zone: 'Europe/Brussels', instant: '2026-09-22T22:30:00Z', today: '2026-09-23' },
	{ zone: 'Pacific/Kiritimati', instant: '2026-12-31T12:30:00Z', today: '2027-01-01' },
	{ zone: 'UTC', instant: '2026-09-23T06:30:00Z', today: '2026-09-23' }
])(
	'uses the device calendar without shifting due-date labels in $zone',
	({ zone, instant, today }) => {
		// Each real Node process initializes Intl and Date in its own device time zone.
		const output = execFileSync(
			process.execPath,
			[
				'--experimental-strip-types',
				'--input-type=module',
				'--eval',
				`const { todayLocalDate, formatLocalDate } = await import(process.argv[1]);
		process.stdout.write(JSON.stringify({ today: todayLocalDate(new Date(process.argv[2])), label: formatLocalDate('2026-09-22') }));`,
				moduleUrl,
				instant
			],
			{ env: { ...process.env, TZ: zone }, encoding: 'utf8' }
		);
		expect(output).toBe(JSON.stringify({ today, label: '22 Sept' }));
	}
);
