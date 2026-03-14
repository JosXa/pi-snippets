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

`~/.pi/agent/snippet/code-standards.md`:
```markdown
#style-guide
#error-handling
#testing-requirements
```

`~/.pi/agent/snippet/full-review.md`:
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
mkdir -p ~/.pi/agent/snippet
```

**2. Add your first snippet:**

`~/.pi/agent/snippet/careful.md`:
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

Snippets can be global (`~/.pi/agent/snippet/*.md`) or project-specific (`.pi/snippet/*.md`). Both directories are loaded automatically. Project snippets override global ones with the same name.

## Features

### Aliases

Define multiple triggers for the same snippet:

`~/.pi/agent/snippet/cherry-pick.md`:
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

### `~/.pi/agent/snippet/context.md`
```markdown
---
aliases: ctx
---
Project: !`basename $(pwd)`
Branch: !`git branch --show-current`
Recent changes: !`git diff --stat HEAD~3 | tail -5`
```

### `~/.pi/agent/snippet/minimal.md`
```markdown
---
aliases:
  - min
  - terse
---
Be extremely concise. No explanations unless asked.
```

## Configuration

The plugin can be configured via `config.jsonc` files:

- **Global**: `~/.pi/agent/snippet/config.jsonc`
- **Project**: `.pi/snippet/config.jsonc` (overrides global settings)

A default config file is created automatically on first run.

### Full Configuration Example

```jsonc
{
  // Logging settings
  "logging": {
    // Enable debug logging to file
    // Logs are written to ~/.pi/agent/logs/snippets/daily/
    "debug": false
  },
  "experimental": {
    "injectBlocks": false, // Enable <inject>...</inject> blocks for persistent context
    "skillRendering": false // Enable <skill>name</skill> tag expansion
  },
  "hideCommandInOutput": false // Show only output for shell commands (hides "$ cmd\n-->")
}
```

All boolean settings accept: `true`, `false`, `"enabled"`, `"disabled"`

### Debug Logging

Logs are written to `~/.pi/agent/logs/snippets/daily/` when enabled.

## Behavior Notes

- Snippets expand everywhere: regular chat, question responses, skills, and slash commands
- Snippets are loaded once at session start
- Hashtag matching is **case-insensitive** (`#Hello` = `#hello`)
- Unknown hashtags are left unchanged
- Failed shell commands preserve the original syntax in output
- Frontmatter is stripped from expanded content
- Only user messages are processed (not assistant responses)

## License

MIT
