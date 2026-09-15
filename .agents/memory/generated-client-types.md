---
name: Generated client type configuration
description: Compiler settings needed by the generated Orval React client
---

The generated API client uses `Headers.entries()`, so any composite TypeScript package that emits the client declarations must include `dom.iterable` alongside `dom` in its `lib` compiler option.

**Why:** Codegen can succeed while the workspace typecheck fails if iterable DOM types are omitted.

**How to apply:** Keep this compiler setting when regenerating the API client or adding another package that consumes the generated fetch helpers.