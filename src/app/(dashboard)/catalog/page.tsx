import { LuDatabase, LuTable2 } from "react-icons/lu";

/**
 * Data Catalog — browse databases, tables, and schemas.
 * Will call /api/catalog to list databases and tables from the metastore.
 */
export default function CatalogPage(): React.JSX.Element {
  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Data Catalog
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse databases and tables in the Hive Metastore.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["bronze", "silver", "gold", "default"].map((db) => (
          <div
            key={db}
            className="group rounded-xl border-2 border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <LuDatabase className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">{db}</h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LuTable2 className="h-3 w-3" />
              <span>{db === "bronze" ? "1 table" : "0 tables"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
