import { SearchPanel } from "./search-panel";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-ink-muted">
          Keyword by default; toggle Semantic to query the M10 vector index.
        </p>
      </header>
      <SearchPanel />
    </div>
  );
}
