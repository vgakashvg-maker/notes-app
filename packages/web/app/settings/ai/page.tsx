import { redirect } from "next/navigation";

export default function AISettingsIndex() {
  // /settings/ai is just a router shell; default tab is Endpoint.
  redirect("/settings/ai/endpoint");
}
