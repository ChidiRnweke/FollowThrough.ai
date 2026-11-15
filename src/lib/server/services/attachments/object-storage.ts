import {
	CopyObjectCommand,
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConflictError, ExternalServiceError, ValidationError } from '$lib/errors';

import type { SignedObjectUpload, StoredObjectInfo } from '$lib/models/attachments';

/** The object storage provider: uploads, downloads and stored bytes, addressed by object key. */
export interface IAttachmentStorage {
	/**
	 * Sign a single PUT that storage admits only with exactly `byteSize` bytes whose SHA-256
	 * digest is `checksumSha256` (hex).
	 */
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<SignedObjectUpload>;
	createDownloadUrl(
		objectKey: string,
		expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string>;
	put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void>;
	stat(objectKey: string): Promise<StoredObjectInfo>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	/**
	 * Copy the source to the destination, then delete the source.
	 *
	 * @throws ConflictError if the source is no longer the version tagged `sourceEtag`.
	 */
	promote(input: { sourceKey: string; sourceEtag: string; destinationKey: string }): Promise<void>;
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
	}): Promise<SignedObjectUpload> {
		// Checked per upload, not remembered: the server keeps no state between operations, and an
		// upload is a user action, so one HEAD request is negligible.
		await this.ensureBucket();
		const checksum = Buffer.from(input.checksumSha256, 'hex').toString('base64');
		const url = await getSignedUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: input.objectKey,
				ContentType: input.mediaType,
				ContentLength: input.byteSize,
				ChecksumSHA256: checksum
			}),
			{
				expiresIn: input.expiresInSeconds,
				signableHeaders: new Set(['content-type', 'content-length', 'x-amz-checksum-sha256']),
				// The presigner hoists `x-amz-*` headers into the query string, where storage does
				// not check the body against it. As a signed header, storage refuses a body whose
				// digest differs (400 BadDigest) and a request that omits the header.
				unhoistableHeaders: new Set(['x-amz-checksum-sha256'])
			}
		);
		// Content-Length is signed but not listed: a browser derives it from the body and does not
		// let a page set it, so a body of any other length fails the signature.
		return {
			url,
			requiredHeaders: { 'content-type': input.mediaType, 'x-amz-checksum-sha256': checksum }
		};
	}

	private async ensureBucket(): Promise<void> {
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
		} catch (error) {
			// `S3ServiceException` declares `$metadata`, and duck-types its own
			// `instanceof`, so this holds even when the error crossed a second copy
			// of the SDK — which is the usual reason the shape gets asserted instead.
			if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404)
				throw error;
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
				new HeadObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey,
					ChecksumMode: 'ENABLED'
				})
			);
			if (!result.ETag) throw new Error('Storage returned no entity tag');
			return {
				byteSize: result.ContentLength ?? -1,
				etag: result.ETag,
				...(result.ContentType ? { mediaType: result.ContentType } : {}),
				// Storage reports the digest in base64; reservations hold it in hex.
				...(result.ChecksumSHA256
					? { checksumSha256: Buffer.from(result.ChecksumSHA256, 'base64').toString('hex') }
					: {})
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

	async promote(input: {
		sourceKey: string;
		sourceEtag: string;
		destinationKey: string;
	}): Promise<void> {
		try {
			await this.client.send(
				new CopyObjectCommand({
					Bucket: this.config.bucket,
					CopySource: encodeURIComponent(`${this.config.bucket}/${input.sourceKey}`),
					CopySourceIfMatch: input.sourceEtag,
					Key: input.destinationKey,
					MetadataDirective: 'COPY'
				})
			);
			await this.client.send(
				new DeleteObjectCommand({ Bucket: this.config.bucket, Key: input.sourceKey })
			);
		} catch (error) {
			if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412)
				throw new ConflictError(
					'The uploaded file changed after it was verified, so it was not saved. Upload it again.'
				);
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
