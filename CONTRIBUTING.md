# Contributing

Thanks for considering a contribution to SyrianFatora MCP.

## Before you start

- Check the README and the relevant documents in `docs/` before changing behavior.
- Open an issue first for substantial changes so the expected behavior and scope can be agreed.
- Keep pull requests focused and explain the problem, the approach, and any compatibility or security impact.
- Submit pull requests against `main` unless the maintainers explicitly request another base branch.

## Security and credentials

- Never commit real SyrianFatora API keys, OAuth client secrets, signing or encryption keys, access tokens, refresh tokens, or personal workspace data.
- Do not put credentials in issues, pull requests, screenshots, test fixtures, URLs, logs, or chat messages.
- Use synthetic test values and isolated test workspaces.
- Do not weaken authentication, authorization, tenant isolation, validation, or security headers to make a test pass.
- Report suspected vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Tests

Run the tests relevant to the files you change and include the commands and results in your pull request. If the maintainer explicitly defers tests for a production migration, document that exception and the remaining uncertainty; never report deferred tests as passing.

The OAuth authorization-worker tests are in `apps/auth`:

```sh
cd apps/auth
npm test
```

The MCP resource-worker tests are in `apps/mcp`:

```sh
cd apps/mcp
npm test
```

Do not use a real production workspace for write-operation tests. Use harmless read-only calls or isolated test data.

## Production changes

Production Worker changes are permitted only as part of the agreed migration documented in [docs/production-migration.md](docs/production-migration.md). Preserve the existing `syrianfatora-mcp` service identity, record every production action and rollback reference, and do not create a duplicate MCP Worker. Do not change DNS/custom domains or bypass Cloudflare deployment conflicts with `--force` without a reviewed migration plan.

## Pull request checklist

- [ ] The change has a clear scope and rationale.
- [ ] Relevant tests pass, or any testing limitation is explicitly documented.
- [ ] Documentation and the production migration log are updated where behavior or setup changes.
- [ ] No credentials, private customer data, or generated secrets are included.
- [ ] Any production change follows the approved runbook and records its rollback reference.
