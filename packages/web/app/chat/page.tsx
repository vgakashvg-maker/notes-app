import { ChatPanel } from "./chat-panel";

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="text-sm text-ink-muted">
          Ask your notes anything. Answers stream from the local Ollama box on your network;
          citations link back to source notes.
        </p>
      </header>
      <ChatPanel />
    </div>
  );
}
