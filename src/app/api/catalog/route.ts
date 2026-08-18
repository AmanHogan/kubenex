import { NextResponse } from "next/server";

/**
 * GET /api/catalog — list databases and tables from the Hive metastore.
 *
 * Query params:
 *   ?db=bronze              → list tables in a database
 *   ?db=bronze&table=sales  → full table detail (columns, properties, stats)
 *   ?db=bronze&table=sales&sample=true → sample data (first 100 rows)
 *
 * In-cluster: queries PostgreSQL Hive metastore + Spark Thrift.
 * Local dev: returns realistic mock data.
 */

// ─── Types ───

interface Column {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isPartitionKey: boolean;
}

interface TableDetail {
  name: string;
  database: string;
  type: string;
  format: string;
  location: string;
  owner: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  properties: Record<string, string>;
  partitionKeys: string[];
  serde: string;
  inputFormat: string;
  outputFormat: string;
  totalSize: string;
  numRows: string;
  numFiles: string;
  permissions: Permission[];
  policies: Policy[];
  lineage: Lineage;
  tags: string[];
}

interface Permission {
  principal: string;
  principalType: "user" | "group" | "role";
  privileges: string[];
  grantedBy: string;
  grantedAt: string;
}

interface Policy {
  name: string;
  type: "retention" | "classification" | "masking" | "quality";
  description: string;
  status: "active" | "inactive";
  config: Record<string, string>;
  createdAt: string;
}

interface Lineage {
  upstream: LineageNode[];
  downstream: LineageNode[];
}

interface LineageNode {
  table: string;
  database: string;
  job: string;
  jobType: "airflow_dag" | "spark_job" | "manual";
  lastRun: string;
}

interface DatabaseSummary {
  name: string;
  description: string;
  owner: string;
  location: string;
  tableCount: number;
  tables: {
    name: string;
    type: string;
    format: string;
    description: string;
    owner: string;
    columnCount: number;
    rowCount: string;
    tags: string[];
  }[];
}

// ─── Mock Data ───

function getMockDatabases(): DatabaseSummary[] {
  return [
    {
      name: "bronze",
      description: "Raw ingested data from external sources",
      owner: "data-engineering",
      location: "s3a://raw-data/bronze/",
      tableCount: 4,
      tables: [
        { name: "sales", type: "EXTERNAL_TABLE", format: "parquet", description: "Raw sales transaction data from POS systems", owner: "ahoganbailey@gmail.com", columnCount: 8, rowCount: "1,247,831", tags: ["raw", "pii"] },
        { name: "customers", type: "EXTERNAL_TABLE", format: "parquet", description: "Customer profiles imported from CRM", owner: "ahoganbailey@gmail.com", columnCount: 12, rowCount: "45,230", tags: ["raw", "pii", "gdpr"] },
        { name: "inventory", type: "EXTERNAL_TABLE", format: "csv", description: "Daily inventory snapshots from warehouse API", owner: "ahoganbailey@gmail.com", columnCount: 6, rowCount: "892,104", tags: ["raw"] },
        { name: "web_events", type: "EXTERNAL_TABLE", format: "json", description: "Clickstream events from web analytics", owner: "ahoganbailey@gmail.com", columnCount: 15, rowCount: "12,847,291", tags: ["raw", "streaming"] },
      ],
    },
    {
      name: "silver",
      description: "Cleaned and conformed data",
      owner: "data-engineering",
      location: "s3a://processed-data/silver/",
      tableCount: 3,
      tables: [
        { name: "dim_customers", type: "MANAGED_TABLE", format: "parquet", description: "Deduplicated customer dimension with SCD Type 2", owner: "ahoganbailey@gmail.com", columnCount: 14, rowCount: "42,105", tags: ["conformed", "dimension"] },
        { name: "fact_sales", type: "MANAGED_TABLE", format: "parquet", description: "Cleaned sales facts joined with customer keys", owner: "ahoganbailey@gmail.com", columnCount: 10, rowCount: "1,198,422", tags: ["conformed", "fact"] },
        { name: "dim_products", type: "MANAGED_TABLE", format: "parquet", description: "Product catalog dimension table", owner: "ahoganbailey@gmail.com", columnCount: 8, rowCount: "3,847", tags: ["conformed", "dimension"] },
      ],
    },
    {
      name: "gold",
      description: "Business-ready aggregations and reporting tables",
      owner: "analytics",
      location: "s3a://processed-data/gold/",
      tableCount: 2,
      tables: [
        { name: "revenue_by_region", type: "MANAGED_TABLE", format: "parquet", description: "Daily revenue aggregations by region for dashboards", owner: "ahoganbailey@gmail.com", columnCount: 5, rowCount: "18,250", tags: ["aggregated", "reporting"] },
        { name: "customer_lifetime_value", type: "MANAGED_TABLE", format: "parquet", description: "CLV scores computed weekly per customer segment", owner: "ahoganbailey@gmail.com", columnCount: 7, rowCount: "42,105", tags: ["aggregated", "ml-feature"] },
      ],
    },
    {
      name: "default",
      description: "Default Hive database",
      owner: "admin",
      location: "s3a://raw-data/default/",
      tableCount: 0,
      tables: [],
    },
  ];
}

function getMockTableDetail(db: string, table: string): TableDetail | null {
  const details: Record<string, TableDetail> = {
    "bronze.sales": {
      name: "sales",
      database: "bronze",
      type: "EXTERNAL_TABLE",
      format: "parquet",
      location: "s3a://raw-data/bronze/sales/",
      owner: "ahoganbailey@gmail.com",
      description: "Raw sales transaction data ingested from point-of-sale systems. Each row represents a single line item in a transaction.",
      createdAt: "2026-06-15T10:30:00Z",
      updatedAt: "2026-08-15T06:00:00Z",
      columns: [
        { name: "transaction_id", type: "string", description: "Unique transaction identifier from POS", nullable: false, isPrimaryKey: true, isPartitionKey: false },
        { name: "product", type: "string", description: "Product SKU or name", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "region", type: "string", description: "Sales region code (US-WEST, US-EAST, EU, APAC)", nullable: false, isPrimaryKey: false, isPartitionKey: true },
        { name: "quantity", type: "int", description: "Number of units sold", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "price", type: "double", description: "Unit price in USD", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "discount", type: "double", description: "Discount percentage applied (0.0 – 1.0)", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "customer_id", type: "string", description: "FK to bronze.customers", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "event_timestamp", type: "timestamp", description: "When the transaction occurred at the POS", nullable: false, isPrimaryKey: false, isPartitionKey: false },
      ],
      properties: {
        "spark.sql.sources.provider": "parquet",
        "spark.sql.partitionProvider": "catalog",
        "transient_lastDdlTime": "1723694400",
        "EXTERNAL": "TRUE",
        "parquet.compression": "snappy",
        "auto.purge": "false",
      },
      partitionKeys: ["region"],
      serde: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
      inputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
      outputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
      totalSize: "2.4 GB",
      numRows: "1,247,831",
      numFiles: "48",
      tags: ["raw", "pii"],
      permissions: [
        { principal: "ahoganbailey@gmail.com", principalType: "user", privileges: ["SELECT", "INSERT", "ALTER", "DROP"], grantedBy: "admin", grantedAt: "2026-06-15T10:30:00Z" },
        { principal: "data-engineering", principalType: "group", privileges: ["SELECT", "INSERT"], grantedBy: "ahoganbailey@gmail.com", grantedAt: "2026-06-20T14:00:00Z" },
        { principal: "analytics", principalType: "group", privileges: ["SELECT"], grantedBy: "ahoganbailey@gmail.com", grantedAt: "2026-07-01T09:00:00Z" },
        { principal: "ml-team", principalType: "role", privileges: ["SELECT"], grantedBy: "ahoganbailey@gmail.com", grantedAt: "2026-07-15T11:00:00Z" },
      ],
      policies: [
        { name: "PII Data Masking", type: "masking", description: "Mask customer_id column for non-owner users", status: "active", config: { column: "customer_id", method: "hash_sha256", applies_to: "group:analytics" }, createdAt: "2026-07-01T00:00:00Z" },
        { name: "Raw Data Retention", type: "retention", description: "Retain raw sales data for 24 months, archive after", status: "active", config: { retention_days: "730", archive_location: "s3a://archive/bronze/sales/", action: "archive" }, createdAt: "2026-06-15T00:00:00Z" },
        { name: "Sales Data Quality", type: "quality", description: "Validate quantity > 0, price > 0, region in allowed list", status: "active", config: { checks: "quantity > 0 AND price > 0", frequency: "on_ingest", alert_channel: "#data-quality" }, createdAt: "2026-06-20T00:00:00Z" },
        { name: "PII Classification", type: "classification", description: "customer_id tagged as PII per GDPR requirements", status: "active", config: { classification: "PII", regulation: "GDPR", columns: "customer_id" }, createdAt: "2026-06-15T00:00:00Z" },
      ],
      lineage: {
        upstream: [
          { table: "pos_api_feed", database: "external", job: "ingest_sales_daily", jobType: "airflow_dag", lastRun: "2026-08-15T06:00:00Z" },
        ],
        downstream: [
          { table: "fact_sales", database: "silver", job: "transform_sales", jobType: "airflow_dag", lastRun: "2026-08-15T06:30:00Z" },
          { table: "revenue_by_region", database: "gold", job: "agg_revenue", jobType: "airflow_dag", lastRun: "2026-08-15T07:00:00Z" },
        ],
      },
    },
    "bronze.customers": {
      name: "customers",
      database: "bronze",
      type: "EXTERNAL_TABLE",
      format: "parquet",
      location: "s3a://raw-data/bronze/customers/",
      owner: "ahoganbailey@gmail.com",
      description: "Customer profiles imported from CRM system. Contains PII fields subject to GDPR data handling requirements.",
      createdAt: "2026-06-15T10:30:00Z",
      updatedAt: "2026-08-14T06:00:00Z",
      columns: [
        { name: "customer_id", type: "string", description: "Unique customer identifier", nullable: false, isPrimaryKey: true, isPartitionKey: false },
        { name: "first_name", type: "string", description: "Customer first name (PII)", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "last_name", type: "string", description: "Customer last name (PII)", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "email", type: "string", description: "Customer email address (PII)", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "phone", type: "string", description: "Phone number (PII)", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "address", type: "string", description: "Mailing address (PII)", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "city", type: "string", description: "City", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "state", type: "string", description: "State or province code", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "country", type: "string", description: "ISO country code", nullable: false, isPrimaryKey: false, isPartitionKey: true },
        { name: "segment", type: "string", description: "Customer segment (enterprise, smb, consumer)", nullable: true, isPrimaryKey: false, isPartitionKey: false },
        { name: "created_date", type: "date", description: "Account creation date", nullable: false, isPrimaryKey: false, isPartitionKey: false },
        { name: "updated_at", type: "timestamp", description: "Last CRM sync timestamp", nullable: false, isPrimaryKey: false, isPartitionKey: false },
      ],
      properties: {
        "spark.sql.sources.provider": "parquet",
        "EXTERNAL": "TRUE",
        "parquet.compression": "snappy",
      },
      partitionKeys: ["country"],
      serde: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
      inputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
      outputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
      totalSize: "890 MB",
      numRows: "45,230",
      numFiles: "12",
      tags: ["raw", "pii", "gdpr"],
      permissions: [
        { principal: "ahoganbailey@gmail.com", principalType: "user", privileges: ["SELECT", "INSERT", "ALTER", "DROP"], grantedBy: "admin", grantedAt: "2026-06-15T10:30:00Z" },
        { principal: "data-engineering", principalType: "group", privileges: ["SELECT", "INSERT"], grantedBy: "ahoganbailey@gmail.com", grantedAt: "2026-06-20T14:00:00Z" },
      ],
      policies: [
        { name: "GDPR PII Masking", type: "masking", description: "Mask first_name, last_name, email, phone, address for non-privileged users", status: "active", config: { columns: "first_name,last_name,email,phone,address", method: "redact", applies_to: "group:analytics" }, createdAt: "2026-06-15T00:00:00Z" },
        { name: "GDPR Right to Erasure", type: "retention", description: "Support deletion requests within 30 days per GDPR Article 17", status: "active", config: { sla_days: "30", process: "manual_review" }, createdAt: "2026-06-15T00:00:00Z" },
      ],
      lineage: {
        upstream: [
          { table: "crm_api", database: "external", job: "sync_customers", jobType: "airflow_dag", lastRun: "2026-08-14T06:00:00Z" },
        ],
        downstream: [
          { table: "dim_customers", database: "silver", job: "transform_customers", jobType: "airflow_dag", lastRun: "2026-08-14T07:00:00Z" },
        ],
      },
    },
  };

  return details[`${db}.${table}`] ?? null;
}

function getMockSampleData(db: string, table: string): { columns: string[]; rows: Record<string, unknown>[] } {
  const samples: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {
    "bronze.sales": {
      columns: ["transaction_id", "product", "region", "quantity", "price", "discount", "customer_id", "event_timestamp"],
      rows: [
        { transaction_id: "TXN-001847", product: "Widget Pro", region: "US-WEST", quantity: 3, price: 29.99, discount: 0.1, customer_id: "C-4821", event_timestamp: "2026-08-14T14:23:11Z" },
        { transaction_id: "TXN-001848", product: "Gadget X", region: "US-EAST", quantity: 1, price: 149.99, discount: 0.0, customer_id: "C-1092", event_timestamp: "2026-08-14T14:25:03Z" },
        { transaction_id: "TXN-001849", product: "Widget Basic", region: "EU", quantity: 12, price: 9.99, discount: 0.15, customer_id: "C-7734", event_timestamp: "2026-08-14T14:30:45Z" },
        { transaction_id: "TXN-001850", product: "Gadget X", region: "APAC", quantity: 2, price: 149.99, discount: 0.05, customer_id: "C-3201", event_timestamp: "2026-08-14T15:01:22Z" },
        { transaction_id: "TXN-001851", product: "Widget Pro", region: "US-WEST", quantity: 1, price: 29.99, discount: 0.0, customer_id: null, event_timestamp: "2026-08-14T15:12:08Z" },
        { transaction_id: "TXN-001852", product: "Connector Kit", region: "US-EAST", quantity: 5, price: 14.99, discount: 0.2, customer_id: "C-5501", event_timestamp: "2026-08-14T15:18:33Z" },
        { transaction_id: "TXN-001853", product: "Widget Basic", region: "EU", quantity: 8, price: 9.99, discount: 0.0, customer_id: "C-8812", event_timestamp: "2026-08-14T15:22:17Z" },
        { transaction_id: "TXN-001854", product: "Gadget X", region: "US-WEST", quantity: 1, price: 149.99, discount: 0.1, customer_id: "C-2203", event_timestamp: "2026-08-14T15:45:00Z" },
        { transaction_id: "TXN-001855", product: "Widget Pro", region: "APAC", quantity: 4, price: 29.99, discount: 0.0, customer_id: "C-6690", event_timestamp: "2026-08-14T16:02:41Z" },
        { transaction_id: "TXN-001856", product: "Connector Kit", region: "EU", quantity: 2, price: 14.99, discount: 0.0, customer_id: "C-1120", event_timestamp: "2026-08-14T16:15:55Z" },
      ],
    },
    "bronze.customers": {
      columns: ["customer_id", "first_name", "last_name", "email", "phone", "city", "state", "country", "segment", "created_date"],
      rows: [
        { customer_id: "C-1092", first_name: "Alex", last_name: "Chen", email: "alex.c@example.com", phone: "+1-555-0101", city: "Seattle", state: "WA", country: "US", segment: "enterprise", created_date: "2025-03-12" },
        { customer_id: "C-2203", first_name: "Jordan", last_name: "Smith", email: "j.smith@example.com", phone: "+1-555-0202", city: "Portland", state: "OR", country: "US", segment: "smb", created_date: "2025-05-08" },
        { customer_id: "C-3201", first_name: "Yuki", last_name: "Tanaka", email: "y.tanaka@example.jp", phone: "+81-3-1234-5678", city: "Tokyo", state: null, country: "JP", segment: "enterprise", created_date: "2025-07-22" },
        { customer_id: "C-4821", first_name: "Morgan", last_name: "Davis", email: "m.davis@example.com", phone: "+1-555-0303", city: "Austin", state: "TX", country: "US", segment: "consumer", created_date: "2025-08-15" },
        { customer_id: "C-5501", first_name: "Sam", last_name: "Müller", email: "s.muller@example.de", phone: "+49-30-12345", city: "Berlin", state: null, country: "DE", segment: "smb", created_date: "2025-09-01" },
      ],
    },
  };

  return samples[`${db}.${table}`] ?? { columns: [], rows: [] };
}

// ─── Route Handler ───

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const db = url.searchParams.get("db");
    const table = url.searchParams.get("table");
    const sample = url.searchParams.get("sample");

    // Table detail
    if (db && table) {
      if (sample === "true") {
        const data = getMockSampleData(db, table);
        return NextResponse.json({ ...data, source: "mock" });
      }
      const detail = getMockTableDetail(db, table);
      if (!detail) {
        return NextResponse.json({ error: `Table ${db}.${table} not found` }, { status: 404 });
      }
      return NextResponse.json({ table: detail, source: "mock" });
    }

    // Database list
    const databases = getMockDatabases();
    return NextResponse.json({ databases, source: "mock" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
