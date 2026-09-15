export interface StoredObjectInfo {
	readonly byteSize: number;
	readonly mediaType?: string;
	readonly checksumSha256?: string;
}

export interface IAttachmentStorage {
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string>;
	createDownloadUrl(
		objectKey: string,
		expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string>;
	put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void>;
	stat(objectKey: string): Promise<StoredObjectInfo>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	promote(sourceKey: string, destinationKey: string): Promise<void>;
	remove(objectKey: string): Promise<void>;
}
