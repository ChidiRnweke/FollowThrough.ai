/**
 * SHA-256 of a file, hex encoded. Object storage verifies the upload against this,
 * so it has to be computed in the browser before the presigned PUT is issued.
 */
export async function fileChecksumSha256(file: File): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
