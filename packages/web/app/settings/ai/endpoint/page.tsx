import { EndpointForm } from "./endpoint-form";

export default function AIEndpointPage() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-medium">Ollama endpoint</h2>
        <p className="text-xs text-ink-muted">
          Tailscale Funnel URL of your home box. Test before saving — the test calls{" "}
          <code className="text-[0.8em]">/api/tags</code> via the{" "}
          <code className="text-[0.8em]">ai/test-connection</code> Edge Function.
        </p>
      </header>
      <EndpointForm />
    </div>
  );
}
