"use client";

import { useCallback, useState } from "react";
import { ChatStream } from "../../components/chat-stream";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

/**
 * The interactive chat shell. Holds the input box + a single in-flight
 * ReadableStream handed to <ChatStream>. The streaming UI is owned by
 * <ChatStream>; this component is only responsible for kicking off the
 * fetch to the M09 `ai/chat` Edge Function with a fresh JWT.
 */
export function ChatPanel() {
  const [stream, setStream] = useState<ReadableStream<Uint8Array> | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [askError, setAskError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (message.trim().length === 0 || pending) return;
      setPending(true);
      setAskError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ai-chat`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ message, conversationId }),
        });
        if (!res.ok || res.body === null) {
          setAskError(`Chat failed (${res.status})`);
          setPending(false);
          return;
        }
        setStream(res.body);
        setMessage("");
      } catch (cause) {
        setAskError(cause instanceof Error ? cause.message : "chat failed");
        setPending(false);
      }
    },
    [conversationId, message, pending],
  );

  return (
    <div className="space-y-4">
      <ChatStream
        stream={stream}
        onDone={(e) => {
          setConversationId(e.conversationId);
          setPending(false);
        }}
      />
      {askError !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {askError}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          aria-label="Message"
          className="flex-1 rounded-md border border-ink/10 bg-surface px-3 py-2 text-sm dark:bg-surface-inverse/30 dark:border-ink-inverse/10"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask anything…"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-2 text-sm text-brand-fg disabled:opacity-60"
        >
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
