/**
 * Sends an upload's bytes to object storage and turns both ways it can fail into
 * an error a person can act on.
 *
 * A rejected request (offline, DNS, or a bucket without a CORS rule for this
 * origin) reaches the caller as the browser's bare "Failed to fetch", which says
 * neither what failed nor what to check. A response the bucket refuses carries
 * an S3 `<Message>` worth showing.
 */
export const storeUploadBytes = async (
	send: () => Promise<Response>,
	subject = 'upload'
): Promise<void> => {
	let stored: Response;
	try {
		stored = await send();
	} catch (error) {
		throw new Error(
			`Could not reach file storage, so the ${subject} was not saved. Check your connection, or ask the operator to allow this site in the storage CORS settings.`,
			{ cause: error }
		);
	}
	if (stored.ok) return;
	const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
	throw new Error(
		detail
			? `File storage rejected the ${subject}: ${detail}`
			: `File storage rejected the ${subject} (${stored.status})`
	);
};
