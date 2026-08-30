import { NextResponse } from "next/server";
import {
  listBuckets,
  listObjects,
  presignDownload,
  previewObject,
  uploadObject,
  MAX_UPLOAD_BYTES,
} from "@/lib/minio";

/**
 * GET /api/storage
 *   (no params)                    -> list buckets
 *   ?bucket=X&prefix=Y             -> list one level of a bucket
 *   ?bucket=X&key=Y&action=download-> presigned download URL
 *   ?bucket=X&key=Y&action=preview -> text preview (capped)
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const bucket = url.searchParams.get("bucket");
    const prefix = url.searchParams.get("prefix") ?? "";
    const key = url.searchParams.get("key");
    const action = url.searchParams.get("action");

    if (!bucket) {
      return NextResponse.json({ buckets: await listBuckets() });
    }

    if (key && action === "download") {
      return NextResponse.json({ url: await presignDownload(bucket, key) });
    }

    if (key && action === "preview") {
      return NextResponse.json(await previewObject(bucket, key));
    }

    return NextResponse.json(await listObjects(bucket, prefix));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/storage — upload a file into a bucket.
 *
 * Multipart body: file, bucket, prefix (optional).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const bucket = String(form.get("bucket") ?? "");
    const prefix = String(form.get("prefix") ?? "");

    if (!bucket) {
      return NextResponse.json({ error: "Bucket is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 }
      );
    }

    // Strip any path components from the browser-supplied name so a crafted
    // filename cannot write outside the intended prefix.
    const safeName = file.name.split(/[\\/]/).pop() ?? "upload";
    const key = `${prefix}${safeName}`;

    const body = new Uint8Array(await file.arrayBuffer());
    const result = await uploadObject(bucket, key, body, file.type);

    return NextResponse.json({
      ...result,
      bucket,
      // Ready to paste into CREATE TABLE ... LOCATION.
      s3aPath: `s3a://${bucket}/${key}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
