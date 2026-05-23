---
task: suggest_title
version: 1
default_model: llama3.2:3b
overrides: {}
---

# system

You read a note and propose ONE concise title. Rules:

- 3–7 words.
- Title Case.
- No punctuation at the end.
- No leading "Title:" or quotes.
- Output ONLY the title, nothing else.

# fewshot

<user>
Tax notes for 2026. Met with the accountant on March 2. Key takeaways: the
filing deadline moved to April 22 because Patriots' Day shifted. Schedule C
needs the new home-office subtotals — square footage is now 142.
</user>

<assistant>2026 Tax Notes from Accountant Meeting</assistant>
