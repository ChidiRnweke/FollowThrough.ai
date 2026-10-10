import type {
	SectionNumberingSetting,
	SectionNumberingLevel,
	SectionNumberingView
} from '$lib/models/notes';

const resolveSectionNumbering = (
	noteOverride?: boolean,
	projectDefault?: boolean,
	appDefault?: boolean
): boolean => noteOverride ?? projectDefault ?? appDefault ?? false;

/** Numbering follows the heading ladder the note type scale defines. */
const DEEPEST_NUMBERED_LEVEL = 6;
export interface NoteSectionNumbering {
	view(
		noteOverride?: boolean,
		projectDefault?: boolean,
		appDefault?: boolean
	): SectionNumberingView;
	fromMenu(level: SectionNumberingLevel): SectionNumberingSetting;
	toMenu(override: SectionNumberingSetting): SectionNumberingLevel;
	numbers(levels: readonly number[]): readonly string[];
}
export class NoteSectionNumberingService implements NoteSectionNumbering {
	view(
		noteOverride?: boolean,
		projectDefault?: boolean,
		appDefault?: boolean
	): SectionNumberingView {
		return {
			effective: resolveSectionNumbering(noteOverride, projectDefault, appDefault),
			noteOverride,
			inherited: projectDefault ?? appDefault ?? false
		};
	}
	fromMenu(level: SectionNumberingLevel): SectionNumberingSetting {
		return level === 'default' ? undefined : level === 'on';
	}
	toMenu(override: SectionNumberingSetting): SectionNumberingLevel {
		return override === undefined ? 'default' : override ? 'on' : 'off';
	}
	numbers(levels: readonly number[]): readonly string[] {
		// The heading level that opened each depth, so a later heading can tell
		// whether it is a sibling of that depth or the start of a deeper one.
		const openedBy: number[] = [];
		const counters: number[] = [];

		return levels.map((raw) => {
			const level = Math.min(Math.max(Math.trunc(raw) || 1, 1), DEEPEST_NUMBERED_LEVEL);
			while (openedBy.length > 0 && level < openedBy[openedBy.length - 1]) openedBy.pop();

			const isSibling = openedBy.length > 0 && level === openedBy[openedBy.length - 1];
			if (!isSibling) openedBy.push(level);

			// `counters` still holds the previous branch's numbers. Longer than the
			// current depth means this depth has been numbered before under the same
			// parent, so continue it; otherwise it is genuinely new.
			if (isSibling || counters.length >= openedBy.length) {
				counters[openedBy.length - 1] += 1;
				counters.length = openedBy.length;
			} else {
				counters.push(1);
			}

			return counters.join('.');
		});
	}
}
