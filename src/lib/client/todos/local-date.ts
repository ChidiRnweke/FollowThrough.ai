import type { LocalDate } from '$lib/models/workspace';

export function todayLocalDate(): LocalDate {
	return new Date().toISOString().slice(0, 10) as LocalDate;
}
