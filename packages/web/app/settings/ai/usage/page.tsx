import { UsagePanel } from "./usage-panel";

export default function AIUsagePage() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-medium">Usage</h2>
        <p className="text-xs text-ink-muted">
          Calls + tokens + latency per task per day, last 14 days. Source:
          <code className="ml-1 text-[0.85em]">ai_usage_log</code>.
        </p>
      </header>
      <UsagePanel />
    </div>
  );
}
