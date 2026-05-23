import { SignInButton } from "./sign-in-button";
import { safeRedirectTarget } from "../../lib/safe-redirect";

export default function SignInPage({ searchParams }: { searchParams: { redirectTo?: string } }) {
  const redirectTo = safeRedirectTarget(searchParams.redirectTo);
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in to Notes</h1>
        <p className="text-sm text-ink-muted">
          Notes with a local AI second brain. Your home Ollama box stays in charge of the AI side.
        </p>
      </header>
      <SignInButton redirectTo={redirectTo} />
    </div>
  );
}
