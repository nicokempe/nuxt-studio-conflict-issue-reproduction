# Repository conventions

- Keep every fixture synthetic and independent of any production website.
- Never add customer identities, domains, copy, credentials, browser captures or production identifiers.
- Use Bun 1.4.3, strict TypeScript, descriptive names and compact TSDoc for reusable functions.
- Do not replace a shipped implementation with a hand-written imitation in a reproduction.
- On `main`, tests assert the known upstream failure. On `fixes`, the same tests assert the repaired behavior.
- Keep version guards around extraction and transformations of the published Studio bundle.
- Document observations separately from inferred causes and controlled test scenarios.
- Run tests, typechecking, lint and a production build before publishing changes.
