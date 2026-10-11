import type { AttachmentBrowserPort } from '$lib/controllers/attachments/controller';
import type { AttachmentUploadIntent, AttachmentObjectWrite } from '$lib/models/attachments';
import { fileChecksumSha256 } from './checksum';
import { workspaceAccountHint } from '$lib/client/workspace/account-hint';
export class BrowserAttachmentFiles implements AttachmentBrowserPort {
	constructor(private readonly fetcher: typeof fetch = fetch) {}
	checksum(file: File): Promise<string> {
		return fileChecksumSha256(file);
	}
	async put(intent: AttachmentUploadIntent, file: File): Promise<AttachmentObjectWrite> {
		const response = await this.fetcher(intent.uploadUrl, {
			method: 'PUT',
			headers: intent.requiredHeaders,
			body: file
		});
		if (response.ok) return { kind: 'stored' };
		const detail = (await response.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
		return { kind: 'failure', status: response.status, ...(detail ? { detail } : {}) };
	}
	get accountId(): string | null {
		return workspaceAccountHint(document.cookie);
	}
	identity(): string {
		return crypto.randomUUID();
	}
	now(): number {
		return Date.now();
	}
}
