# Definition of Done (per module)

> Apply this checklist to **every** module before declaring it complete. If
> any item is unchecked, the module is NOT done — regardless of how much code
> was written.

## Code

- [ ] All public functions on the port interface are implemented.
- [ ] No code outside the module's adapter files references the underlying
      provider by name. (`grep -r "ollama" --include="*.kt" --include="*.ts"`
      should return only the adapter file.)
- [ ] No `TODO`, `FIXME`, or `XXX` comments outside the module's own
      "future-work" notes.
- [ ] No commented-out code.
- [ ] Public APIs have KDoc / TSDoc comments.

## Tests

- [ ] Unit tests cover happy path + one failure path per public function.
- [ ] At least one integration test exercises the module end-to-end against a
      real adapter (or a documented fake).
- [ ] Tests run in CI and pass.
- [ ] Test coverage isn't a goal in itself but **critical paths must be
      covered** — sync, RLS, AI streaming, auth flow.

## Documentation

- [ ] README in the module folder explaining:
        - Responsibilities (2–3 sentences)
        - Public interface (link to port file)
        - How to swap the adapter (concrete checklist)
- [ ] If the module makes a non-obvious architecture decision, an ADR exists
      in `docs/adr/NNNN-decision.md`.

## Security

- [ ] No secrets in code or in committed files. Use environment variables.
- [ ] If the module touches user data, RLS policies are tested.
- [ ] If the module calls an external API, error messages don't leak provider
      details to end users.

## Modularity (the critical test)

- [ ] The module can be deleted and replaced by a stub implementing the same
      port without compile errors in any other module.
- [ ] If this fails, the boundary is wrong — refactor before declaring done.

## Operational

- [ ] If the module has a scheduled job, it's registered in pg_cron with a
      sensible cadence.
- [ ] If the module emits telemetry, it's wired to Sentry / PostHog with
      no PII in payloads.
- [ ] Manual smoke test passed: I followed the module's README from scratch
      and it worked.

## Hand-back

- [ ] Pull request opened with a concise description: what was built, what
      tests were run, anything the reviewer should look at twice.
- [ ] Branch is up-to-date with main.
- [ ] CI is green.
