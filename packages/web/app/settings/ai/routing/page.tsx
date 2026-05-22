import { RoutingForm } from "./routing-form";

export default function AIRoutingPage() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-medium">Routing</h2>
        <p className="text-xs text-ink-muted">
          Pick a model per task. Defaults come from <code className="text-[0.8em]">V1_ROUTES</code>;
          your overrides land in <code className="text-[0.8em]">ai_prefs.routing</code> and are read
          by every AI task at runtime.
        </p>
      </header>
      <RoutingForm />
    </div>
  );
}
