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

Run the tests relevant to the files you change and include the commands and results in your pull request.

The OAuth authorization-worker tests are currently part of the draft implementation on [PR #1](https://github.com/kenanwahbeh/SyrianFatora-MCP/pull/1), not the `main` baseline. On a checkout that contains `apps/auth`, run:

```sh
cd apps/auth
npm test
```

Do not use a real production workspace for write-operation tests. Use harmless read-only calls or isolated test data.

## Pull request checklist

- [ ] The change has a clear scope and rationale.
- [ ] Relevant tests pass, or any testing limitation is explained.
- [ ] Documentation is updated where behavior or setup changes.
- [ ] No credentials, private customer data, or generated secrets are included.
- [ ] Production resources, deployments, routes, and DNS are not changed as part of the contribution.
