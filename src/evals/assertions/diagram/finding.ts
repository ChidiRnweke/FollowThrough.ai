/**
 * How much a defect costs.
 *
 * Two tiers, because two different things were being called failures. A diagram
 * that draws a connection the source rules out, or dresses a product in a
 * generic pictogram, is *wrong*: no amount of tidiness elsewhere redeems it. A
 * diagram with one arrow clipping the corner of a box it does not belong to is
 * *untidy*, and a reviewer would still publish it.
 *
 * `points` exists only on the arm where it means something. A blemish carries
 * its own count — three crossings on one edge are three blemishes, not one —
 * so the budget is spent per defect rather than per rule that happened to fire.
 */
export type Severity =
	{ readonly kind: 'blocking' } | { readonly kind: 'blemish'; readonly points: number };

export const blocking: Severity = { kind: 'blocking' };

export const blemish = (points: number): Severity => ({ kind: 'blemish', points });

/**
 * One thing wrong with a diagram.
 *
 * Structural rules and per-case expectations answer different questions but fail
 * the same way, so a case concatenates both lists. The id is left generic so
 * each producer can keep its own closed union of names and neither has to know
 * about the other's.
 */
export interface DiagramFinding<Id extends string = string> {
	readonly rule: Id;
	readonly detail: string;
	/** Cell ids, so a failure points at the XML rather than at the picture. */
	readonly offenders: readonly string[];
	readonly severity: Severity;
}

export const blemishPoints = (findings: readonly DiagramFinding[]): number =>
	findings.reduce(
		(total, finding) => total + (finding.severity.kind === 'blemish' ? finding.severity.points : 0),
		0
	);

export const blockingFindings = <Id extends string>(
	findings: readonly DiagramFinding<Id>[]
): readonly DiagramFinding<Id>[] =>
	findings.filter((finding) => finding.severity.kind === 'blocking');

/** The failure message: every broken rule named, rather than a bare `false`. */
export const describeFindings = (findings: readonly DiagramFinding[]): string =>
	findings.length === 0
		? 'no diagram findings'
		: findings
				.map((finding) => {
					const cost =
						finding.severity.kind === 'blocking'
							? 'blocking'
							: `${finding.severity.points} point${finding.severity.points === 1 ? '' : 's'}`;
					const cells = finding.offenders.length ? ` (cells: ${finding.offenders.join(', ')})` : '';
					return `[${finding.rule} · ${cost}] ${finding.detail}${cells}`;
				})
				.join('\n');
