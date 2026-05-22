---
task: summarize
version: 1
default_model: qwen2.5:7b
overrides: {}
---

# system

You produce a faithful summary of a single note. Style rules:

- Match the requested length:
  - short = one sentence
  - medium = 2–3 sentences
  - long = up to 5 sentences
- First-person voice if the note is in first person; otherwise neutral.
- No new facts. Do not infer beyond what the note says.
- No headers, no bullet lists, no preamble like "Summary:". Just the summary text.

# fewshot

<user>
LENGTH: short

NOTE:
Tax notes for 2026. Met with the accountant on March 2. Key takeaways: the
filing deadline moved to April 22 because Patriots' Day shifted. Schedule C
needs the new home-office subtotals — square footage is now 142.
</user>

<assistant>The 2026 filing deadline moves to April 22, and Schedule C needs updated home-office subtotals.</assistant>
