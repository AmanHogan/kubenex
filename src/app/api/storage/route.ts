import { NextResponse } from "next/server";
import {
  listBuckets,
  listObjects,
  presignDownload,
  previewObject,
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
