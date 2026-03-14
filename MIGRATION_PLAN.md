# Migration Plan: opencode-snippets → pi-snippets

> **Source:** [opencode-snippets](https://github.com/JosXa/opencode-snippets) v1.7.1
> **Target:** Pi extension package (`pi-snippets`)
> **Date:** 2026-03-14

## Executive Summary

Port the hashtag-based snippet expansion system from an OpenCode plugin to a Pi extension package. The core logic (expander, loader, config, shell commands) is platform-agnostic and can be preserved nearly verbatim. The integration layer — hook registration, command handling, and message injection — needs a full rewrite to use Pi's extension API.

Pi is *not* a fork of OpenCode. It has a completely different plugin architecture: event-driven (`pi.on(...)`) vs hook-based, with different message lifecycle events, different command registration, and different concepts for session management. The migration is a rewrite of the **integration glue** while preserving the **domain logic**.

---

## Architecture Comparison

| Concern | OpenCode (current) | Pi (target) |
|---|---|---|
| **Plugin entry** | `Plugin` function returning hook object | `export default function(pi: ExtensionAPI)` |
| **Hook: user message** | `chat.message` hook (mutate output.parts) | `pi.on("input", ...)` — transform text before agent |
| **Hook: message transform** | `experimental.chat.messages.transform` | `pi.on("context", ...)` — modify messages before LLM call |
| **Hook: before agent** | N/A | `pi.on("before_agent_start", ...)` — inject system prompt, inject message |
| **Command registration** | `config()` hook + `command.execute.before` | `pi.registerCommand("snippet", { ... })` |
| **Skill integration** | Custom `tool.execute.after` interception | `pi.on("resources_discover", ...)` for skill paths |
| **Shell execution** | `ctx.$` (Bun shell via OpenCode) | `pi.exec(command, args)` |
| **Notifications** | `client.session.prompt({ noReply, parts: [{ ignored }] })` | `ctx.ui.notify(text, level)` |
| **Config directory** | `~/.config/opencode/snippet/` | `~/.pi/agent/snippet/` (custom, or use Pi settings) |
| **Project config dir** | `.opencode/snippet/` | `.pi/snippet/` |
| **Package format** | npm with `@opencode-ai/plugin` peer dep | npm/git with `pi` manifest in `package.json` |
| **Dependencies resolution** | `peerDependencies: @opencode-ai/plugin` | `peerDependencies: @mariozechner/pi-coding-agent` |
| **Bundled skill** | `skill/` dir in npm package, registered via config hook | `skills/` dir in package, declared in `pi` manifest |
| **State persistence** | N/A (in-memory only) | `pi.appendEntry()` for session state |
| **TypeScript loading** | Compiled to JS via tsc, published as `dist/` | Loaded directly via jiti (no build step needed) |

---

## What Can Be Preserved As-Is

These modules contain zero OpenCode-specific code and can be copied directly:

| Module | Lines | Notes |
|---|---|---|
| `src/expander.ts` | ~200 | Core hashtag expansion engine, block parsing. **Zero changes.** |
| `src/types.ts` | ~65 | All type definitions (Snippet, SnippetRegistry, etc). Drop `OpencodeClient` type. |
| `src/arg-parser.ts` | ~90 | Shell-like argument parser. **Zero changes.** |
| `src/injection-manager.ts` | ~40 | Manages inject block lifecycle. **Zero changes.** |
| `src/skill-renderer.ts` | ~50 | `expandSkillTags()` function. **Zero changes.** |

**Total preserved: ~445 lines (~60% of domain logic)**

## What Needs Adaptation

| Module | Lines | Adaptation |
|---|---|---|
| `src/loader.ts` | ~200 | Change path constants (`~/.config/opencode/` → `~/.pi/agent/`), replace `Bun.file()` with `node:fs`. |
| `src/config.ts` | ~180 | Change path constants, keep JSONC parsing logic. |
| `src/constants.ts` | ~40 | Rewrite paths to use Pi conventions. |
| `src/logger.ts` | ~100 | Adapt log directory, or use `console.log` / Pi's notification system. |
| `src/skill-loader.ts` | ~120 | Change directory paths. Alternatively, simplify — Pi already has built-in skill discovery. |
| `src/shell.ts` | ~50 | Replace `ctx.$` Bun shell with `pi.exec()`. |
| `src/notification.ts` | ~20 | Replace with `ctx.ui.notify()`. Trivial. |

## What Needs a Full Rewrite

| Module | Lines | Why |
|---|---|---|
| `index.ts` (entry point) | ~250 | Entirely OpenCode hook-based. Rewrite as Pi extension factory. |
| `src/commands.ts` | ~300 | Uses OpenCode's `client.session.prompt` API. Rewrite using `pi.registerCommand()` and `ctx.ui.*`. |
| `src/hook-types.ts` | ~50 | OpenCode-specific type definitions. Replace with Pi event types from `@mariozechner/pi-coding-agent`. |

---

## Detailed Migration Steps

### Phase 1: Project Scaffolding

1. Initialize the new repository structure
2. Set up `package.json` with Pi package manifest
3. Configure Biome (copy existing config)
4. Set up the extension entry point skeleton

**Target structure:**

```
pi-snippets/
├── package.json              # Pi package manifest
├── biome.json
├── tsconfig.json             # For type checking only (jiti loads .ts directly)
├── extensions/
│   └── index.ts              # Main extension entry point
├── src/
│   ├── expander.ts           # Preserved
│   ├── types.ts              # Preserved (minus OpencodeClient)
│   ├── arg-parser.ts         # Preserved
│   ├── injection-manager.ts  # Preserved
│   ├── skill-renderer.ts     # Preserved
│   ├── loader.ts             # Adapted paths
│   ├── config.ts             # Adapted paths
│   ├── constants.ts          # Rewritten for Pi
│   ├── logger.ts             # Adapted or simplified
│   ├── shell.ts              # Rewritten for pi.exec()
│   └── commands.ts           # Rewritten for pi.registerCommand()
├── skills/
│   └── snippets/
│       └── SKILL.md          # Adapted for Pi paths
├── tests/
│   ├── expander.test.ts      # Preserved
│   ├── loader.test.ts        # Adapted
│   ├── arg-parser.test.ts    # Preserved
│   ├── commands.test.ts      # Rewritten
│   └── integration.test.ts   # New
└── README.md
```

### Phase 2: Core Logic Migration

1. Copy platform-agnostic modules verbatim
2. Adapt `constants.ts` for Pi directory conventions:
   - Global snippets: `~/.pi/agent/snippet/` (or configurable)
   - Project snippets: `.pi/snippet/`
   - Global config: `~/.pi/agent/snippet/config.jsonc`
   - Project config: `.pi/snippet/config.jsonc`
   - Logs: `~/.pi/agent/logs/snippets/daily/`
3. Adapt `loader.ts`: replace `Bun.file().text()` with `fs.readFileSync()` or `Bun.file()` (Pi uses jiti which supports both)
4. Adapt `config.ts`: update paths, keep JSONC parsing
5. Adapt `shell.ts`: replace Bun shell with `pi.exec()`

### Phase 3: Extension Entry Point

Rewrite `index.ts` as a Pi extension:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function snippetsExtension(pi: ExtensionAPI) {
  // 1. pi.on("input") — expand hashtags in user input (replaces chat.message hook)
  // 2. pi.on("context") — handle inject blocks + expand in historical messages
  //    (replaces experimental.chat.messages.transform)
  // 3. pi.on("before_agent_start") — inject persistent context from <inject> blocks
  // 4. pi.on("resources_discover") — register bundled skill paths
  // 5. pi.registerCommand("snippet") — snippet management
  // 6. pi.on("session_start") — load snippets & config
  // 7. pi.on("session_shutdown") — cleanup
}
```

**Key mapping decisions:**

| OpenCode Hook | Pi Event | Behavior |
|---|---|---|
| `chat.message` (user msg mutation) | `input` event | Return `{ action: "transform", text: expandedText }` |
| `experimental.chat.messages.transform` | `context` event | Modify `event.messages` array, expand hashtags in user messages |
| `config()` registering skill path | `resources_discover` event | Return `{ skillPaths: [...] }` |
| `config()` registering `/snippet` command | `pi.registerCommand("snippet", ...)` | Direct registration |
| `tool.execute.after` (skill tool) | `tool_result` event | Check if toolName is skill-related, expand in result |
| `session.idle` (cleanup injections) | `agent_end` event | Clear injection manager for session |

### Phase 4: Command System Rewrite

Rewrite `commands.ts` to use Pi's command API:

```typescript
pi.registerCommand("snippet", {
  description: "Manage text snippets (add, delete, list, help)",
  handler: async (args, ctx) => {
    // Parse args, dispatch to subcommands
    // Use ctx.ui.notify() for output instead of sendIgnoredMessage()
    // Use ctx.ui.select() for interactive choices
  },
});
```

**Key differences:**
- Output via `ctx.ui.notify(text, "info")` instead of ignored message injection
- Can use `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.input()` for interactive flows
- The `args` parameter is a raw string; reuse `parseCommandArgs()` for parsing

### Phase 5: Shell Command Substitution

Replace the Bun-shell-dependent `executeShellCommands()`:

```typescript
// Before (OpenCode):
const output = await ctx.$`${{ raw: cmd }}`.quiet().nothrow().text();

// After (Pi):
const result = await pi.exec("bash", ["-c", cmd], { timeout: 10000 });
const output = result.stdout;
```

Note: `pi.exec()` is accessed via the `pi` closure (captured in the extension factory), not via `ctx`.

### Phase 6: Skill Registration

Replace the OpenCode config hook with Pi's `resources_discover` event:

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..", "skills");

pi.on("resources_discover", () => {
  return {
    skillPaths: [join(SKILL_DIR, "snippets", "SKILL.md")],
  };
});
```

**Also update the SKILL.md** to reference Pi paths instead of OpenCode paths.

### Phase 7: Injection System Adaptation

The `<inject>` block system needs the biggest conceptual adaptation:

**OpenCode approach:** Inject blocks are added as extra user messages via the transform hook.

**Pi approach:** Use `pi.on("before_agent_start")` to inject content as a message or modify the system prompt:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  const injections = injectionManager.getInjections(sessionId);
  if (!injections?.length) return;

  return {
    message: {
      customType: "snippet-inject",
      content: injections.join("\n\n"),
      display: false, // Hidden from TUI
    },
  };
});
```

Alternatively, inject blocks can be appended to the system prompt:

```typescript
return {
  systemPrompt: event.systemPrompt + "\n\n" + injections.join("\n\n"),
};
```

The system prompt approach is simpler and keeps inject content truly invisible. The message approach is more faithful to the original behavior. **Decision needed during implementation.**

### Phase 8: Testing

1. **Preserve** pure logic tests:
   - `expander.test.ts` — all tests should pass without changes
   - `arg-parser.test.ts` — all tests should pass without changes
   - `skill-renderer.test.ts` — all tests should pass without changes
   - `loader.test.ts` — adapt paths in test setup

2. **Rewrite** integration tests:
   - `index.test.ts` → test Pi extension lifecycle
   - `commands.test.ts` → test with mock Pi `ExtensionAPI`
   - `config.integration.test.ts` → update paths

3. **Add** new tests:
   - Extension registration test (verify events subscribed, command registered)
   - Input transform test (mock `input` event, verify expansion)
   - Context transform test (mock `context` event, verify message modification)

### Phase 9: Package Configuration

**`package.json`:**

```json
{
  "name": "pi-snippets",
  "version": "0.1.0",
  "description": "Hashtag-based snippet expansion for Pi",
  "keywords": ["pi-package"],
  "type": "module",
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "jsonc-parser": "^3.3.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.11",
    "@types/bun": "latest",
    "@types/node": "^22"
  }
}
```

**Key differences from opencode-snippets:**
- No `tsc` build step (Pi uses jiti to load `.ts` directly)
- No `dist/` output
- `pi` manifest instead of OpenCode plugin format
- `peerDependencies` on `@mariozechner/pi-coding-agent` instead of `@opencode-ai/plugin`
- Skills in `skills/` directory (convention-based discovery)

### Phase 10: Documentation & README

Rewrite README for Pi:
- Installation: `pi install npm:pi-snippets` or `pi install git:github.com/JosXa/pi-snippets`
- Configuration paths: `~/.pi/agent/snippet/` instead of `~/.config/opencode/snippet/`
- Command: `/snippet` (same)
- Usage: `#hashtag` (same)
- Drop OpenCode-specific sections (slash command comparison, OpenCode config)

### Phase 11: CI/CD

Adapt GitHub Actions:
- Keep Bun for test/lint
- Update release workflow for Pi package format
- No `tsc` build step needed
- Publish to npm with `pi-package` keyword

### Phase 12: Legacy Cleanup

Remove OpenCode-specific code that has no Pi equivalent:
- `cleanupLegacySkillInstall()` — not needed for fresh Pi package
- `hook-types.ts` — replaced by Pi's typed events
- `notification.ts` — replaced by `ctx.ui.notify()`
- `Bun.file()` calls in loader — replaced by `node:fs` for broader compatibility

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Pi `input` event doesn't provide mutable message parts | High | Verify with Pi docs — `input` returns `{ action: "transform", text }` which should work for simple text. Multi-part messages may need `context` event. |
| `pi.exec()` doesn't support Bun shell's tagged template syntax | Medium | Use `bash -c "command"` wrapper. Test with complex commands. |
| Inject blocks may behave differently as system prompt vs user messages | Medium | Test both approaches, pick the one that models respond to better. |
| Pi doesn't have an `experimental.chat.messages.transform` equivalent for historical messages | Medium | `context` event provides `event.messages` which is a deep copy of all messages — this should suffice. |
| No `session.idle` event in Pi for injection cleanup | Low | Use `agent_end` event instead, or clear on `before_agent_start`. |
| Test mocking Pi's `ExtensionAPI` is harder than OpenCode's simple hook object | Low | Create a test helper that mocks the API surface. |

---

## Open Questions

1. **Snippet directory location:** Should we use `~/.pi/agent/snippet/` (new convention) or support both old and new paths for users migrating from opencode-snippets?
2. **Backward compatibility:** Should we detect and offer to migrate existing `~/.config/opencode/snippet/` files?
3. **Package name:** `pi-snippets` or `@josxa/pi-snippets` (scoped)?
4. **Inject block strategy:** System prompt injection vs ephemeral user message?
5. **Bun dependency:** Pi loads via jiti, which runs in Node. Should we drop all `Bun.*` APIs in favor of `node:fs` for compatibility, or keep them since Bun is the dev environment?

---

## Checklist

### Phase 1: Scaffolding
- [ ] Create repository `pi-snippets`
- [ ] Initialize `package.json` with `pi` manifest and `pi-package` keyword
- [ ] Configure `biome.json` (copy from opencode-snippets)
- [ ] Configure `tsconfig.json` (typecheck only, no emit)
- [ ] Set up `.gitignore`
- [ ] Set up `.editorconfig`
- [ ] Create directory structure (`extensions/`, `src/`, `skills/`, `tests/`)

### Phase 2: Core Logic
- [ ] Copy `src/expander.ts` (no changes)
- [ ] Copy `src/types.ts` (remove `OpencodeClient` type)
- [ ] Copy `src/arg-parser.ts` (no changes)
- [ ] Copy `src/injection-manager.ts` (no changes)
- [ ] Copy `src/skill-renderer.ts` (no changes)
- [ ] Rewrite `src/constants.ts` for Pi paths
- [ ] Adapt `src/loader.ts` (update paths, replace `Bun.file()` if needed)
- [ ] Adapt `src/config.ts` (update paths)
- [ ] Adapt `src/logger.ts` (update log directory)
- [ ] Rewrite `src/shell.ts` for `pi.exec()`

### Phase 3: Extension Entry Point
- [ ] Create `extensions/index.ts` with Pi extension factory
- [ ] Implement `input` event handler (hashtag expansion in user input)
- [ ] Implement `context` event handler (expand in historical messages)
- [ ] Implement `before_agent_start` handler (inject blocks)
- [ ] Implement `resources_discover` handler (skill registration)
- [ ] Implement `session_start` handler (load snippets & config)
- [ ] Implement `agent_end` handler (cleanup injections)

### Phase 4: Commands
- [ ] Rewrite `/snippet add` using `pi.registerCommand()` + `ctx.ui.*`
- [ ] Rewrite `/snippet delete`
- [ ] Rewrite `/snippet list`
- [ ] Rewrite `/snippet help`
- [ ] Implement argument completion via `getArgumentCompletions`

### Phase 5: Shell
- [ ] Rewrite `executeShellCommands()` to use `pi.exec()`
- [ ] Test with complex shell commands (pipes, redirects, env vars)

### Phase 6: Skills
- [ ] Copy and adapt `skills/snippets/SKILL.md` for Pi paths
- [ ] Register via `resources_discover` event
- [ ] Test skill discovery with `pi install`

### Phase 7: Injection System
- [ ] Decide: system prompt injection vs ephemeral message
- [ ] Implement chosen approach
- [ ] Test injection persistence across agentic loop turns
- [ ] Test injection cleanup between prompts

### Phase 8: Testing
- [ ] Copy and verify `expander.test.ts` passes unchanged
- [ ] Copy and verify `arg-parser.test.ts` passes unchanged
- [ ] Copy and verify `skill-renderer.test.ts` passes unchanged
- [ ] Adapt `loader.test.ts` for new paths
- [ ] Rewrite integration tests for Pi extension lifecycle
- [ ] Add extension registration test
- [ ] Add input transform test
- [ ] Add context transform test
- [ ] All tests green

### Phase 9: Packaging
- [ ] Finalize `package.json` with correct `pi` manifest
- [ ] Test `pi install` from local path
- [ ] Test `pi -e ./extensions/index.ts` for quick testing
- [ ] Verify skill auto-discovery works

### Phase 10: Documentation
- [ ] Write README.md for Pi
- [ ] Update installation instructions
- [ ] Update configuration path references
- [ ] Document migration guide from opencode-snippets
- [ ] Add usage examples

### Phase 11: CI/CD
- [ ] Set up GitHub Actions CI (lint, typecheck, test)
- [ ] Set up release workflow (tag → npm publish)
- [ ] Test npm publish with `pi-package` keyword

### Phase 12: Cleanup & Polish
- [ ] Remove all OpenCode-specific dead code
- [ ] Remove legacy cleanup functions
- [ ] Run `biome check` — zero warnings
- [ ] Manual end-to-end test in Pi
- [ ] Publish v0.1.0

---

## Estimated Effort

| Phase | Effort |
|---|---|
| Phase 1: Scaffolding | 0.5h |
| Phase 2: Core Logic | 2h |
| Phase 3: Extension Entry Point | 3h |
| Phase 4: Commands | 2h |
| Phase 5: Shell | 1h |
| Phase 6: Skills | 0.5h |
| Phase 7: Injection System | 2h |
| Phase 8: Testing | 3h |
| Phase 9: Packaging | 1h |
| Phase 10: Documentation | 1.5h |
| Phase 11: CI/CD | 1h |
| Phase 12: Cleanup & Polish | 1h |
| **Total** | **~18.5h** |

The core domain logic (~60%) ports with zero or minimal changes. The integration layer is a full rewrite but follows clear patterns documented in Pi's extension examples.
