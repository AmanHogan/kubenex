/**
 * MinIO / S3 storage client.
 *
 * MinIO speaks the S3 API, so this uses the AWS SDK rather than hand-rolling
 * SigV4 signing. Everything here is server-only — the credentials must never
 * reach the browser, so this module is imported exclusively by route handlers.
 */

import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MINIO_ENDPOINT =
  process.env.MINIO_ENDPOINT ??
  "http://minio.data-platform.svc.cluster.local:9000";

export interface BucketInfo {
  name: string;
  creationDate: string | null;
}

/** A prefix ("folder") inside a bucket. */
export interface FolderInfo {
  prefix: string;
  name: string;
}

export interface ObjectInfo {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
}

function client(): S3Client {
  return new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: process.env.MINIO_REGION ?? "us-east-1",
    // MinIO serves buckets as a path segment, not a DNS subdomain.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
    },
  });
}

/** List all buckets. */
export async function listBuckets(): Promise<BucketInfo[]> {
  const res = await client().send(new ListBucketsCommand({}));
  return (res.Buckets ?? []).map((b) => ({
    name: b.Name ?? "",
    creationDate: b.CreationDate?.toISOString() ?? null,
  }));
}

/**
 * List one level of a bucket.
 *
 * S3 has no real directories, so `Delimiter` is what turns a flat keyspace
 * into something browsable: keys sharing a prefix up to the next "/" come
 * back as CommonPrefixes instead of individual objects.
 */
export async function listObjects(
  bucket: string,
  prefix = "",
  maxKeys = 500
): Promise<{ folders: FolderInfo[]; objects: ObjectInfo[]; truncated: boolean }> {
  const res = await client().send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: "/",
      MaxKeys: maxKeys,
    })
  );

  const folders: FolderInfo[] = (res.CommonPrefixes ?? []).map((p) => {
    const full = p.Prefix ?? "";
    return {
      prefix: full,
      name: full.slice(prefix.length).replace(/\/$/, ""),
    };
  });

  const objects: ObjectInfo[] = (res.Contents ?? [])
    // The prefix itself comes back as a zero-byte key when a "folder"
    // placeholder object exists; it is not a file the user wants to see.
    .filter((o) => o.Key && o.Key !== prefix)
    .map((o) => ({
      key: o.Key ?? "",
      name: (o.Key ?? "").slice(prefix.length),
      size: o.Size ?? 0,
      lastModified: o.LastModified?.toISOString() ?? null,
      etag: o.ETag?.replace(/"/g, "") ?? null,
    }));

  return { folders, objects, truncated: res.IsTruncated ?? false };
}

/**
 * Presigned GET URL for a single object.
 *
 * Presigning lets the browser download directly from MinIO without the
 * credentials ever leaving the server or the bytes being proxied through it.
 */
export async function presignDownload(
  bucket: string,
  key: string,
  expiresIn = 300
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

/** Fetch a text preview of an object, capped so a huge file can't be pulled in. */
export async function previewObject(
  bucket: string,
  key: string,
  maxBytes = 64 * 1024
): Promise<{ text: string; size: number; truncated: boolean }> {
  const s3 = client();
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key })
  );
  const size = head.ContentLength ?? 0;

  const res = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${maxBytes - 1}`,
    })
  );

  const text = (await res.Body?.transformToString()) ?? "";
  return { text, size, truncated: size > maxBytes };
}

/** Largest upload accepted in a single request. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Upload one object.
 *
 * The body is buffered rather than streamed: uploads here are small analytic
 * files, and buffering keeps the content-length known so MinIO does not need
 * chunked-transfer support enabled.
 */
export async function uploadObject(
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType?: string
): Promise<{ key: string; size: number }> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return { key, size: body.byteLength };
}
