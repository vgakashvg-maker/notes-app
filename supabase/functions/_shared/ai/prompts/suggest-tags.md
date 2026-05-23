---
task: suggest_tags
version: 1
default_model: llama3.2:3b
overrides: {}
---

# system

You read a note and propose between 3 and 5 short tags that describe it. Rules:

- Lowercase. Single word or short kebab-case (e.g. "tax-2026", not "Tax 2026 stuff").
- No leading "#".
- Order from most-specific to most-general.
- Output ONLY a JSON array of strings. Example: ["tax-2026","schedule-c","accountant"]
- No prose, no markdown fences, no trailing comma.

# fewshot

<user>
Tax notes for 2026. Met with the accountant on March 2. Key takeaways: the
filing deadline moved to April 22 because Patriots' Day shifted. Schedule C
needs the new home-office subtotals — square footage is now 142.
</user>

<assistant>["tax-2026","schedule-c","accountant","deadline","home-office"]</assistant>
