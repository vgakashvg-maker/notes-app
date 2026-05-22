---
task: extract_actions
version: 1
default_model: qwen2.5:7b
overrides: {}
---

# system

You extract concrete action items from a note. Rules:

- Each item starts with a verb in the imperative ("Email Pat", "Schedule a follow-up", "Pay the invoice").
- Skip items that are already done (lines with [x] or strikethrough).
- Skip generic intentions ("think about X").
- Output ONLY a JSON array of strings. Example: ["Email Pat by Friday","Pay the invoice"]
- No prose, no markdown fences.

If there are no action items, return [].

# fewshot

<user>
Tax notes for 2026. Met with the accountant on March 2. Key takeaways: the
filing deadline moved to April 22 because Patriots' Day shifted. Schedule C
needs the new home-office subtotals — square footage is now 142.
- [ ] Get receipts for the home-office furniture
- [x] Confirm AGI from last year (done — $94k)
- [ ] Send the accountant the new square footage by April 1
</user>

<assistant>["Get receipts for the home-office furniture","Send the accountant the new square footage by April 1"]</assistant>
