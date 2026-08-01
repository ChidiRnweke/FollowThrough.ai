import {
	CopyObjectCommand,
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ExternalServiceError, ValidationError } from '$lib/errors';

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

export interface ObjectStorageConfig {
	readonly endpoint: string;
	readonly region: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
	readonly forcePathStyle: boolean;
}

export class AttachmentStorage implements IAttachmentStorage {
	private readonly client: S3Client;
	private bucketReady: Promise<void> | undefined;

	constructor(private readonly config: ObjectStorageConfig) {
		this.client = new S3Client({
			endpoint: config.endpoint,
			region: config.region,
			forcePathStyle: config.forcePathStyle,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey
			}
		});
	}

	async createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string> {
		await this.ensureBucket();
		return getSignedUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: input.objectKey,
				ContentType: input.mediaType,
				Metadata: { sha256: input.checksumSha256 }
			}),
			{
				expiresIn: input.expiresInSeconds,
				signableHeaders: new Set(['content-type', 'x-amz-meta-sha256']),
				// Metadata headers are hoisted into the query string by default. The browser
				// sends this value as a required header, so keep it in SignedHeaders instead.
				unhoistableHeaders: new Set(['x-amz-meta-sha256'])
			}
		);
	}

	private ensureBucket(): Promise<void> {
		return (this.bucketReady ??= this.checkOrCreateBucket());
	}

	private async checkOrCreateBucket(): Promise<void> {
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
		} catch (error) {
			const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
				?.httpStatusCode;
			if (status !== 404) throw error;
			await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
		}
	}

	createDownloadUrl(
		objectKey: string,
		expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string> {
		return getSignedUrl(
			this.client,
			new GetObjectCommand({
				Bucket: this.config.bucket,
				Key: objectKey,
				...(downloadFilename
					? {
							ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/["\\\r\n]/g, '_')}"`
						}
					: {})
			}),
			{ expiresIn: expiresInSeconds }
		);
	}

	async put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		try {
			await this.client.send(
				new PutObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey,
					Body: data,
					ContentType: mediaType
				})
			);
		} catch (error) {
			throw new ExternalServiceError('Generated document could not be stored', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async stat(objectKey: string): Promise<StoredObjectInfo> {
		try {
			const result = await this.client.send(
				new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey })
			);
			return {
				byteSize: result.ContentLength ?? -1,
				...(result.ContentType ? { mediaType: result.ContentType } : {}),
				...(result.Metadata?.sha256 ? { checksumSha256: result.Metadata.sha256 } : {})
			};
		} catch (error) {
			throw new ExternalServiceError('Attachment object could not be verified', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async read(objectKey: string, maximumBytes: number): Promise<Uint8Array> {
		try {
			const result = await this.client.send(
				new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey })
			);
			if ((result.ContentLength ?? 0) > maximumBytes)
				throw new ValidationError('Attachment is too large to parse');
			if (!result.Body) throw new ExternalServiceError('Attachment object was empty');
			const bytes = await result.Body.transformToByteArray();
			if (bytes.byteLength > maximumBytes)
				throw new ValidationError('Attachment is too large to parse');
			return bytes;
		} catch (error) {
			if (error instanceof ValidationError || error instanceof ExternalServiceError) throw error;
			throw new ExternalServiceError('Attachment object could not be read', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async promote(sourceKey: string, destinationKey: string): Promise<void> {
		try {
			await this.client.send(
				new CopyObjectCommand({
					Bucket: this.config.bucket,
					CopySource: encodeURIComponent(`${this.config.bucket}/${sourceKey}`),
					Key: destinationKey,
					MetadataDirective: 'COPY'
				})
			);
			await this.client.send(
				new DeleteObjectCommand({ Bucket: this.config.bucket, Key: sourceKey })
			);
		} catch (error) {
			throw new ExternalServiceError('Attachment object could not be committed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async remove(objectKey: string): Promise<void> {
		try {
			await this.client.send(
				new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey })
			);
		} catch (error) {
			throw new ExternalServiceError('Attachment object could not be removed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}

export interface AttachmentParser {
	readonly kind: string;
	supports(mediaType: string, path: string): boolean;
	parse(bytes: Uint8Array): Promise<string>;
}

const TEXT_EXTENSIONS = new Set([
	'md',
	'txt',
	'json',
	'yaml',
	'yml',
	'xml',
	'csv',
	'ts',
	'js',
	'py',
	'sh',
	'sql',
	'html',
	'css',
	'svelte'
]);

export class TextAttachmentParser implements AttachmentParser {
	readonly kind = 'text';
	supports(mediaType: string, path: string): boolean {
		const extension = path.split('.').pop()?.toLowerCase() ?? '';
		return mediaType.startsWith('text/') || TEXT_EXTENSIONS.has(extension);
	}
	async parse(bytes: Uint8Array): Promise<string> {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	}
}

/**
 * Only plain text is decoded in-process. Every other format — PDFs, office
 * documents, images — is read by the OCR engine, which returns markdown with
 * tables and described images intact.
 */
export class AttachmentParserRegistry {
	constructor(
		private readonly parsers: readonly AttachmentParser[] = [new TextAttachmentParser()]
	) {}

	select(mediaType: string, path: string): AttachmentParser | undefined {
		return this.parsers.find((parser) => parser.supports(mediaType, path));
	}
}
