import type { LocalDate, PromiseCandidate, TextSelection } from '$lib/models';
import { ValidationError } from '$lib/models';

const titleCase = (value: string): string =>
	value.charAt(0).toUpperCase() + value.slice(1).replace(/[.!?]+$/, '');

const localDate = (date: Date): LocalDate => date.toISOString().slice(0, 10) as LocalDate;

export function parsePromises(
	selection: TextSelection,
	baseDate = new Date()
): readonly PromiseCandidate[] {
	const text = selection.text.trim();
	if (!text) throw new ValidationError('A non-empty selection is required');
	const candidates: PromiseCandidate[] = [];
	for (const sentence of text.split(/(?<=[.!?])\s+/)) {
		if (/\?$/.test(sentence) || /\b(?:could|option(?:ally)?)\b/i.test(sentence)) continue;
		const match = sentence.match(
			/^(.+?)\s+(promise(?:s)?\s+to|will|should|might)\s+(.+?)(?:\s+(tomorrow|by end of next week|by\s+[^.]+))?[.!]?$/i
		);
		if (!match) continue;
		const ownerName = match[1]!.trim();
		const marker = match[2]!.toLowerCase();
		const dueDateVerbatim = match[4];
		const strength =
			marker.includes('promise') || marker === 'will'
				? 'explicit'
				: marker === 'should'
					? 'implied'
					: 'tentative';
		const action = titleCase(match[3]!.trim().replace(/\s+tomorrow$/i, ''));
		const tomorrow = new Date(baseDate);
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		candidates.push({
			action,
			ownerName,
			responsibility: /^(i|we)$/i.test(ownerName) ? 'mine' : 'waiting_on',
			...(dueDateVerbatim ? { dueDateVerbatim } : {}),
			...(dueDateVerbatim?.toLowerCase() === 'tomorrow'
				? { resolvedDueDate: localDate(tomorrow) }
				: {}),
			strength,
			confidence: strength === 'explicit' ? 95 : strength === 'implied' ? 70 : 55
		});
	}
	return candidates;
}
