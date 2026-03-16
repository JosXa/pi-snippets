# pi-snippets

✨ **Instant inline text expansion for Pi** - Type `#snippet` anywhere in your message and watch it transform.

> [!TIP]
> **Share Your Snippets!**  
> Got a snippet that saves you time? Share yours or steal ideas from the community!
> Browse and contribute in [GitHub Discussions](https://github.com/JosXa/opencode-snippets/discussions/categories/snippets).

## Why Snippets?

As developers, we DRY (Don't Repeat Yourself) our code. We extract functions, create libraries, compose modules. Why should our prompts be any different?

Stop copy-pasting (or worse, *typing* 🤢) the same instructions into every message. Snippets bring software engineering principles to prompt engineering:

- 🔄 **DRY** - Write once, reuse everywhere
- 🧩 **Composability** - Build complex prompts from simple pieces  
- 🔧 **Maintainability** - Update once, apply everywhere
- 🔍 **Discoverability** - Your team's best practices, always a `#hashtag` away

Pi's `/slash` commands must come first. Snippets work anywhere:

```
# Slash commands (must be first):
/model Please review my changes

# Snippets (anywhere!):
Please review my changes #git-status and suggest improvements #code-style
```

Snippets work naturally, inline, and composable.

### 🎯 Composable by Design

Snippets compose with each other. Reference `#snippets` anywhere - in your messages, or even inside other snippets:

**Example: Snippets composing snippets**

`~/.config/snippets/code-standards.md`:
```markdown
#style-guide
#error-handling
#testing-requirements
```

`~/.config/snippets/full-review.md`:
```markdown
#code-standards
#security-checklist
#performance-tips
```

Compose base snippets into higher-level ones. Type `#full-review` to inject all standards at once, keeping each concern in its own maintainable file.

**The power:** Mix and match. Type `#tdd #careful` for test-driven development with extra caution. Create layered prompts from small, reusable pieces.

## Installation

Install directly via Pi's CLI:

```bash
pi install git:github.com/JosXa/pi-snippets
```

## Quick Start

**1. Create your global snippets directory:**

```bash
mkdir -p ~/.config/snippets
```

**2. Add your first snippet:**

`~/.config/snippets/careful.md`:
```markdown
---
aliases: safe
---
Think step by step. Double-check your work before making changes.
Ask clarifying questions if anything is ambiguous.
```

**3. Use it anywhere!**

Type `#careful` or `#safe` in your messages and they will automatically expand.

## Where to Store Snippets

Snippets can be stored in two locations:

- **Global:** `~/.config/snippets/*.md` — shared across all projects and tool-agnostic (works with both pi-snippets and opencode-snippets)
- **Project:** `.pi/snippets/*.md` — scoped to the current project

Both directories are loaded automatically. Project snippets override global ones with the same name.

## Features

### Aliases

Define multiple triggers for the same snippet:

`~/.config/snippets/cherry-pick.md`:
```markdown
---
aliases:
  - cp
  - pick
description: "Git cherry-pick helper"
---
Always pick parent 1 for merge commits.
```

Now `#cherry-pick`, `#cp`, and `#pick` all expand to the same content.

Single alias doesn't need array syntax:
```markdown
---
aliases: safe
---
```

You can also use JSON array style: `aliases: ["cp", "pick"]`

### Shell Command Substitution

Snippets support the ``!`command` `` syntax for injecting live command output:

```markdown
Current branch: !`git branch --show-current`
Last commit: !`git log -1 --oneline`
Working directory: !`pwd`
```

> **Note:** By default, snippets show both the command and its output:
> ``!`ls` `` → 
> ```
> $ ls
> --> <output>
> ```
> This tells the LLM which command was actually run and makes failures visible (empty output would otherwise be indistinguishable from success).
>
> To show only the output, set `hideCommandInOutput: true` in your config.

### Recursive Includes

Snippets can include other snippets using `#snippet-name` syntax. This allows building complex, composable snippets from smaller pieces:

```markdown
# In base-style.md:
Use TypeScript strict mode. Always add JSDoc comments.

# In python-style.md:
Use type hints. Follow PEP 8.

# In review.md:
Review this code carefully:
#base-style
#python-style
#security-checklist
```

**Loop Protection:** Snippets are expanded up to 15 times per message to support deep nesting. If a circular reference is detected, expansion stops after 15 iterations and the remaining hashtag is left as-is.

### Prepend and Append Blocks

For long reference material that would break your writing flow, use `<append>` blocks to place content at the end of your message:

```markdown
---
aliases: jira-mcp
---
Jira MCP server
<append>
## Jira MCP Usage

Use these custom field mappings when creating issues:
- customfield_16570 => Acceptance Criteria
- customfield_11401 => Team
</append>
```

**Input:** `Create a bug ticket in #jira-mcp about the memory leak`

**Output:**
```
Create a bug ticket in Jira MCP server about the memory leak

## Jira MCP Usage

Use these custom field mappings when creating issues:
- customfield_16570 => Acceptance Criteria
- customfield_11401 => Team
```

Write naturally—reference what you need mid-sentence—and the context follows at the bottom.

Use `<prepend>` for content that should appear at the top of your message. Multiple blocks of the same type are concatenated in order of appearance.

### Inject Blocks (Experimental)

Add persistent context that the LLM sees throughout the entire agentic loop, without cluttering your visible message:

```markdown
---
aliases: safe
---
Think step by step.
<inject>
IMPORTANT: Double-check all code for security vulnerabilities.
Always suggest tests for any implementation.
</inject>
```

**Input:** `Review this code #safe`

**What happens:**
- Your message shows: `Review this code Think step by step.`
- The LLM also receives the inject content as a separate context via the system prompt
- This context persists for the entire conversation turn (agentic loop)

Use inject blocks for rules, constraints, or instructions that should influence all LLM responses without appearing inline in your message.

Injected snippet context is re-inserted when it becomes stale. By default this happens after **5 conversation messages**. Configure it with `injectRecencyMessages`.

**Enable in config:**

```jsonc
{
  "experimental": {
    "injectBlocks": true
  }
}
```

### Skill Rendering (Experimental)

Inline Pi skills directly into your messages using XML-style tags:

```markdown
Create a Jira ticket. <skill>jira</skill>
```

Or use the self-closing format:

```markdown
<skill name="jira" /> Create a ticket for the bug.
```

**Enable in config:**

```jsonc
{
  "experimental": {
    "skillRendering": true
  }
}
```

Skills are loaded from Pi's standard skill directories (`~/.pi/agent/skills/` and `.pi/skills/`).

## Example Snippets

### `~/.config/snippets/context.md`
```markdown
---
aliases: ctx
---
Project: !`basename $(pwd)`
Branch: !`git branch --show-current`
Recent changes: !`git diff --stat HEAD~3 | tail -5`
```

### `~/.config/snippets/minimal.md`
```markdown
---
aliases:
  - min
  - terse
---
Be extremely concise. No explanations unless asked.
```

## Port status vs `../opencode-snippets`

This repo already covers most of the **core snippet engine** we had in OpenCode, plus a few Pi-specific integration bits.

### What is already covered in Pi

| Area | Status | Notes |
|---|---|---|
| Regular chat input | ✅ | `#snippet` expansion works in normal user prompts via Pi's `input` hook. |
| Snippet aliases | ✅ | `aliases` frontmatter works. |
| Recursive snippet includes | ✅ | Nested `#other-snippet` expansion is ported. |
| Loop protection | ✅ | Circular includes stop after the configured depth. |
| Shell substitution | ✅ | ``!`command` `` execution is ported to Pi. |
| `<prepend>` / `<append>` blocks | ✅ | Block extraction and final message assembly are ported. |
| `<inject>` blocks | ✅ | Pi-specific integration uses `before_agent_start` to add inject content to the system prompt for the current agentic loop. |
| Global + project snippet loading | ✅ | `~/.config/snippets/` and `.pi/snippets/` both load. |
| Legacy project path support | ✅ | `.pi/snippet/` is still supported, with `.pi/snippets/` winning. |
| `/snippet` management command | ✅ | `add`, `delete`, `list`, and `help` exist as a Pi extension command. |
| `#` autocomplete in the Pi editor | ✅ | This is Pi-specific and does not exist in OpenCode in the same way. |
| Bundled snippets skill registration | ✅ | Exposed through Pi's `resources_discover` hook. |
| Basic CLI end-to-end expansion | ✅ | Covered by `tests/e2e.test.ts`. |

### Pi-specific places we still need to cover better

Pi has a few content-expansion paths that do **not** map 1:1 to OpenCode. Those are the big missed areas.

| Pi-specific area | Status | Why it matters |
|---|---|---|
| Prompt template bodies (`.pi/prompts/*.md`) | ⚠️ Missing | Pi expands prompt templates **after** the `input` hook. So `#snippet` in the template file body is not currently re-expanded. This is the closest thing Pi has to "inside workflows". |
| Skill command bodies (`/skill:name`) | ⚠️ Missing | Same problem: Pi expands skill commands after `input`, so snippet tags inside the skill body are currently missed. |
| Automatically loaded skill files | ⚠️ Missing | When the model reads `SKILL.md` directly, snippets inside that file are not processed by this extension. |
| Extension command arguments in general | ⚠️ Missing | Extension commands are checked before `input`, so `#snippet` inside arbitrary extension command args is not globally covered. |
| `context`-phase reprocessing | ❌ Not implemented | We planned this in `MIGRATION_PLAN.md`, but `index.ts` currently has no `pi.on("context", ...)` hook. That is the cleanest fix for prompt-template/skill-body coverage. |
| Experimental skill rendering (`<skill>jira</skill>`) | ⚠️ Incomplete | The renderer exists, but `src/skill-loader.ts` still points at OpenCode skill paths (`.opencode`, `~/.config/opencode/...`). So this is documented, but not actually ported correctly yet. |
| `/snippet` argument completions | ❌ Not implemented | Mentioned in the migration plan, but not implemented in the Pi command registration yet. |

If you're looking for the high-value next step, it's this: **add a proper `context` hook and cover prompt templates + skill bodies.** That's the main Pi-native gap.

## Test checklist

### Already ported and covered by tests

- [x] Core hashtag expansion in normal text — `tests/expander.test.ts`
- [x] Recursive includes and loop protection — `tests/expander.test.ts`
- [x] Case-insensitive hashtag matching — `tests/expander.test.ts`
- [x] `<prepend>`, `<append>`, and `<inject>` parsing/assembly — `tests/expander.test.ts`
- [x] Expansion inside nested block content — `tests/expander.test.ts`
- [x] Global/project snippet loading and override precedence — `tests/loader.test.ts`
- [x] Legacy `.pi/snippet/` support — `tests/loader.test.ts`
- [x] Frontmatter alias normalization (`alias` / `aliases`) — `tests/loader.test.ts`
- [x] Argument parsing for `/snippet` command input strings — `tests/arg-parser.test.ts`
- [x] `#` autocomplete provider behavior — `tests/autocomplete.test.ts`
- [x] Skill tag rendering syntax (`<skill>...</skill>`) — `tests/skill-renderer.test.ts`
- [x] Basic Pi CLI integration for prompt expansion — `tests/e2e.test.ts`

### Implemented, but still missing dedicated tests

- [ ] `/snippet add` command behavior
- [ ] `/snippet delete` command behavior
- [ ] `/snippet list` output formatting
- [ ] `/snippet help` output
- [ ] Config creation + merge behavior (`~/.config/snippets/config.jsonc`, `.pi/snippets/config.jsonc`, legacy `.pi/snippet/config.jsonc`)
- [ ] Shell command substitution execution and failure handling
- [ ] Inject lifecycle integration: `input` → `before_agent_start` → `agent_end`
- [ ] `resources_discover` registration of the bundled snippets skill
- [ ] Editor monkey-patching integration (`#` trigger + wrapping another editor/autocomplete provider)
- [ ] `/reload` flow refreshing config/snippets/autocomplete state
- [ ] Experimental skill rendering using actual Pi skill directories

### Still need to build or finish

- [ ] Add `context` hook support in `index.ts`
- [ ] Expand snippets inside prompt template bodies (`.pi/prompts/*.md`)
- [ ] Expand snippets inside `/skill:name` skill bodies
- [ ] Decide how to support snippets in automatically loaded `SKILL.md` content
- [ ] Decide whether to support snippets inside arbitrary extension command arguments
- [ ] Implement `/snippet` argument completions
- [ ] Fix `src/skill-loader.ts` to use Pi skill directories instead of OpenCode ones
- [ ] Add tests for the Pi skill loader itself

## Configuration

The plugin can be configured via `config.jsonc` files:

- **Global**: `~/.config/snippets/config.jsonc`
- **Project**: `.pi/snippets/config.jsonc` (overrides global settings)

A default config file is created automatically on first run.

### Full Configuration Example

```jsonc
{
  // Logging settings
  "logging": {
    // Enable debug logging to file
    // Logs are written to ~/.config/snippets/logs/
    "debug": false
  },
  "experimental": {
    "injectBlocks": false, // Enable <inject>...</inject> blocks for persistent context
    "skillRendering": false // Enable <skill>name</skill> tag expansion
  },
  "hideCommandInOutput": false, // Show only output for shell commands (hides "$ cmd\n-->")
  "injectRecencyMessages": 5 // Re-inject hidden snippet context after this many messages
}
```

All boolean settings accept: `true`, `false`, `"enabled"`, `"disabled"`

### Debug Logging

Logs are written to `~/.config/snippets/logs/` when enabled.

## Behavior Notes

- Snippets expand in **raw user input** via Pi's `input` hook
- Because Pi expands prompt templates and skill commands **after** `input`, snippet tags inside template/skill file bodies are **not fully covered yet**
- Injected snippet context is re-inserted after `injectRecencyMessages` conversation messages and shows a visible `↳ Injected #name` indicator when refreshed
- Snippets are loaded at session start; use `/reload` to pick up changes without restarting
- Hashtag matching is **case-insensitive** (`#Hello` = `#hello`)
- Unknown hashtags are left unchanged
- Failed shell commands preserve the original syntax in output
- Frontmatter is stripped from expanded content
- Only user messages are processed (not assistant responses)

## License

MIT
