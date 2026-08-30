import { NextResponse } from "next/server";

/**
 * POST /api/ingest — upload a file to MinIO and optionally register
 * it as a Hive external table via Spark SQL.
 *
 * Accepts multipart/form-data with:
 *   - file: the CSV/Parquet/JSON file
 *   - bucket: target MinIO bucket (default: raw-data)
 *   - database: Spark database to register in (optional)
 *   - tableName: table name to create (optional, requires database)
 *   - format: file format hint (csv | parquet | json)
 */

const MINIO_ENDPOINT =
  process.env.MINIO_ENDPOINT ??
  "http://minio.data-platform.svc.cluster.local:9000";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bucket = (formData.get("bucket") as string) ?? "raw-data";
    const database = formData.get("database") as string | null;
    const tableName = formData.get("tableName") as string | null;
    const format = (formData.get("format") as string) ?? "csv";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Upload to MinIO using S3-compatible PUT
    const key = `ingest/${Date.now()}_${file.name}`;
    const uploadUrl = `${MINIO_ENDPOINT}/${bucket}/${key}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // MinIO requires AWS Sig v4 in production — for local dev, use
    // basic auth if MinIO allows it, or proxy via kubectl.
    // This simplified approach works if the bucket has a public-write policy.
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Length": String(fileBuffer.length),
      },
    });

    const s3Location = `s3a://${bucket}/${key}`;

    const result: {
      uploaded: boolean;
      location: string;
      size: number;
      registered: boolean;
      table?: string;
      error?: string;
    } = {
      uploaded: uploadRes.ok,
      location: s3Location,
      size: file.size,
      registered: false,
    };

    // Optionally register as Hive external table
    if (database && tableName && uploadRes.ok) {
      try {
        const createSql = `CREATE EXTERNAL TABLE IF NOT EXISTS ${database}.${tableName} USING ${format} LOCATION '${s3Location}'`;
        // Proxy through the SQL API
        const sqlRes = await fetch(new URL("/api/sql", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: createSql }),
        });
        result.registered = sqlRes.ok;
        result.table = `${database}.${tableName}`;
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Failed to register table";
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
