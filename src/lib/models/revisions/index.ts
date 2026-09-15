/** Revision numbers are independent of the document format and its content comparison. */
export function decideRevisionWrite(
	command: {
		readonly kind: 'save' | 'publish';
		readonly baseMatches: boolean;
		readonly contentChanged: boolean;
	},
	current: { readonly currentRevision: number; readonly publishedRevision: number },
	context: { readonly acceptUnchangedRetry: boolean }
):
	| { readonly kind: 'unchanged' }
	| { readonly kind: 'conflict' }
	| {
			readonly kind: 'write';
			readonly currentRevision: number;
			readonly publishedRevision: number;
	  } {
	const unchanged =
		!command.contentChanged &&
		(command.kind === 'save' || current.currentRevision === current.publishedRevision);
	if (unchanged && context.acceptUnchangedRetry) return { kind: 'unchanged' };
	if (!command.baseMatches) return { kind: 'conflict' };
	if (unchanged) return { kind: 'unchanged' };
	const currentRevision = current.currentRevision + (command.contentChanged ? 1 : 0);
	return {
		kind: 'write',
		currentRevision,
		publishedRevision: command.kind === 'publish' ? currentRevision : current.publishedRevision
	};
}
