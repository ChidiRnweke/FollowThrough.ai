import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFParse } from 'pdf-parse';
import { ExternalServiceError, ValidationError } from '$lib/models';

export interface StoredObjectInfo {
	readonly byteSize: number;
	readonly mediaType?: string;
	readonly checksumSha256?: string;
}

export interface AttachmentStorage {
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string>;
	createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
	stat(objectKey: string): Promise<StoredObjectInfo>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	promote(sourceKey: string, destinationKey: string): Promise<void>;
}

export interface S3AttachmentStorageConfig {
	readonly endpoint: string;
	readonly region: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
	readonly forcePathStyle: boolean;
}

export class S3AttachmentStorage implements AttachmentStorage {
	private readonly client: S3Client;

	constructor(private readonly config: S3AttachmentStorageConfig) {
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

	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string> {
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
				signableHeaders: new Set(['content-type', 'x-amz-meta-sha256'])
			}
		);
	}

	createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
		return getSignedUrl(
			this.client,
			new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
			{ expiresIn: expiresInSeconds }
		);
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

export class PdfAttachmentParser implements AttachmentParser {
	readonly kind = 'pdf';
	supports(mediaType: string, path: string): boolean {
		return mediaType === 'application/pdf' || path.toLowerCase().endsWith('.pdf');
	}
	async parse(bytes: Uint8Array): Promise<string> {
		const parser = new PDFParse({ data: bytes });
		try {
			return (await parser.getText()).text;
		} finally {
			await parser.destroy();
		}
	}
}

export class AttachmentParserRegistry {
	constructor(
		private readonly parsers: readonly AttachmentParser[] = [
			new TextAttachmentParser(),
			new PdfAttachmentParser()
		]
	) {}

	select(mediaType: string, path: string): AttachmentParser | undefined {
		return this.parsers.find((parser) => parser.supports(mediaType, path));
	}
}
