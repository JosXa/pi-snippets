import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { parseCommandArgs } from "./arg-parser.js";
import { PATHS } from "./constants.js";
import { createSnippet, deleteSnippet, listSnippets, reloadSnippets } from "./loader.js";
import { logger } from "./logger.js";
import type { SnippetRegistry } from "./types.js";

interface CommandContext {
  ctx: ExtensionCommandContext;
  args: string[];
  rawArguments: string;
  snippets: SnippetRegistry;
  projectDir?: string;
}

/**
 * Parsed options from the add command arguments
 */
export interface AddOptions {
  aliases: string[];
  description: string | undefined;
  isProject: boolean;
}

/**
 * Parses option arguments for the add command.
 *
 * Supports all variations per PR #13 requirements:
 * - --alias=a,b, --alias a,b, --aliases=a,b, --aliases a,b
 * - --desc=x, --desc x, --description=x, --description x
 * - --project flag
 *
 * @param args - Array of parsed arguments (after name and content extraction)
 * @returns Parsed options object
 */
export function parseAddOptions(args: string[]): AddOptions {
  const result: AddOptions = {
    aliases: [],
    description: undefined,
    isProject: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip non-option arguments
    if (!arg.startsWith("--")) {
      continue;
    }

    // Handle --project flag
    if (arg === "--project") {
      result.isProject = true;
      continue;
    }

    // Check for --alias or --aliases
    if (arg === "--alias" || arg === "--aliases") {
      // Space-separated: --alias a,b
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        result.aliases = parseAliasValue(nextArg);
        i++; // Skip the value arg
      }
      continue;
    }

    if (arg.startsWith("--alias=") || arg.startsWith("--aliases=")) {
      // Equals syntax: --alias=a,b
      const value = arg.includes("--aliases=")
        ? arg.slice("--aliases=".length)
        : arg.slice("--alias=".length);
      result.aliases = parseAliasValue(value);
      continue;
    }

    // Check for --desc or --description
    if (arg === "--desc" || arg === "--description") {
      // Space-separated: --desc value
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        result.description = nextArg;
        i++; // Skip the value arg
      }
      continue;
    }

    if (arg.startsWith("--desc=") || arg.startsWith("--description=")) {
      // Equals syntax: --desc=value
      const value = arg.startsWith("--description=")
        ? arg.slice("--description=".length)
        : arg.slice("--desc=".length);
      result.description = value;
    }
  }

  return result;
}

/**
 * Parse comma-separated alias values, trimming whitespace
 */
function parseAliasValue(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Handles the execution of the snippet command
 */
export async function executeCommand(
  rawArgs: string,
  extensionCtx: ExtensionCommandContext,
  snippets: SnippetRegistry,
  projectDir?: string,
): Promise<void> {
  const args = parseCommandArgs(rawArgs);
  const subcommand = args[0]?.toLowerCase() || "help";

  const cmdCtx: CommandContext = {
    ctx: extensionCtx,
    args: args.slice(1),
    rawArguments: rawArgs,
    snippets,
    projectDir,
  };

  try {
    switch (subcommand) {
      case "add":
      case "create":
      case "new":
        await handleAddCommand(cmdCtx);
        break;
      case "delete":
      case "remove":
      case "rm":
        await handleDeleteCommand(cmdCtx);
        break;
      case "list":
      case "ls":
        await handleListCommand(cmdCtx);
        break;
      default:
        await handleHelpCommand(cmdCtx);
        break;
    }
  } catch (error) {
    logger.error("Command execution failed", {
      subcommand,
      error: error instanceof Error ? error.message : String(error),
    });
    extensionCtx.ui.notify(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

/**
 * Handle /snippet add <name> ["content"] [--project] [--alias=<alias>] [--desc=<description>]
 */
async function handleAddCommand(cmdCtx: CommandContext): Promise<void> {
  const { ctx, args, snippets, projectDir } = cmdCtx;

  if (args.length === 0) {
    ctx.ui.notify(
      'Usage: /snippet add <name> ["content"] [options]\n\n' +
        "Adds a new snippet. Defaults to global directory.\n\n" +
        "Examples:\n" +
        "  /snippet add greeting\n" +
        '  /snippet add bye "see you later"\n' +
        '  /snippet add hi "hello there" --aliases hello,hey\n' +
        '  /snippet add fix "fix imports" --project\n\n' +
        "Options:\n" +
        "  --project             Add to project directory (.pi/snippet/)\n" +
        "  --aliases X,Y,Z       Add aliases (comma-separated)\n" +
        '  --desc "..."          Add a description',
      "info",
    );
    return;
  }

  const name = args[0];

  // Extract content: second argument if it doesn't start with --
  // The arg-parser already handles quoted strings, so content is clean
  let content = "";
  let optionArgs = args.slice(1);

  if (args[1] && !args[1].startsWith("--")) {
    content = args[1];
    optionArgs = args.slice(2);
  }

  // Parse all options using the new parser
  const options = parseAddOptions(optionArgs);

  // Default to global, --project puts it in project directory
  const targetDir = options.isProject ? projectDir : undefined;
  const location = options.isProject && projectDir ? "project" : "global";

  try {
    const filePath = await createSnippet(
      name,
      content,
      { aliases: options.aliases, description: options.description },
      targetDir,
    );

    // Reload snippets
    await reloadSnippets(snippets, projectDir);

    let message = `Added ${location} snippet: ${name}\nFile: ${filePath}`;
    if (content) {
      message += `\nContent: "${truncate(content, 50)}"`;
    } else {
      message += "\n\nEdit the file to add your snippet content.";
    }
    if (options.aliases.length > 0) {
      message += `\nAliases: ${options.aliases.join(", ")}`;
    }

    ctx.ui.notify(message, "info");
  } catch (error) {
    ctx.ui.notify(
      `Failed to add snippet: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

/**
 * Handle /snippet delete <name>
 */
async function handleDeleteCommand(cmdCtx: CommandContext): Promise<void> {
  const { ctx, args, snippets, projectDir } = cmdCtx;

  if (args.length === 0) {
    ctx.ui.notify(
      "Usage: /snippet delete <name>\n\nDeletes a snippet by name. " +
        "Project snippets are checked first, then global.",
      "info",
    );
    return;
  }

  const name = args[0];

  const deletedPath = await deleteSnippet(name, projectDir);

  if (deletedPath) {
    // Reload snippets
    await reloadSnippets(snippets, projectDir);
    ctx.ui.notify(`Deleted snippet: #${name}\nRemoved: ${deletedPath}`, "info");
  } else {
    ctx.ui.notify(
      `Snippet not found: #${name}\n\nUse /snippet list to see available snippets.`,
      "warning",
    );
  }
}

/** Maximum characters for snippet content preview */
const MAX_CONTENT_PREVIEW_LENGTH = 200;
/** Maximum characters for aliases display */
const MAX_ALIASES_LENGTH = 50;
/** Divider line */
const DIVIDER = "────────────────────────────────────────────────";

/**
 * Truncate text with ellipsis if it exceeds maxLength
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Format aliases for display, truncating if needed
 */
function formatAliases(aliases: string[]): string {
  if (aliases.length === 0) return "";

  const joined = aliases.join(", ");
  if (joined.length <= MAX_ALIASES_LENGTH) {
    return ` (aliases: ${joined})`;
  }

  // Truncate and show count
  const truncated = truncate(joined, MAX_ALIASES_LENGTH - 10);
  return ` (aliases: ${truncated} +${aliases.length})`;
}

/**
 * Format a single snippet for display
 */
function formatSnippetEntry(s: { name: string; content: string; aliases: string[] }): string {
  const header = `${s.name}${formatAliases(s.aliases)}`;
  const content = truncate(s.content.trim(), MAX_CONTENT_PREVIEW_LENGTH);

  return `${header}\n${DIVIDER}\n${content || "(empty)"}`;
}

/**
 * Handle /snippet list
 */
async function handleListCommand(cmdCtx: CommandContext): Promise<void> {
  const { ctx, snippets, projectDir } = cmdCtx;

  const snippetList = listSnippets(snippets);

  if (snippetList.length === 0) {
    ctx.ui.notify(
      "No snippets found.\n\n" +
        `Global snippets: ${PATHS.SNIPPETS_DIR}\n` +
        (projectDir
          ? `Project snippets: ${projectDir}/.pi/snippet/`
          : "No project directory detected.") +
        "\n\nUse /snippet add <name> to add a new snippet.",
      "info",
    );
    return;
  }

  const lines: string[] = [];

  // Group by source
  const globalSnippets = snippetList.filter((s) => s.source === "global");
  const projectSnippets = snippetList.filter((s) => s.source === "project");

  if (globalSnippets.length > 0) {
    lines.push(`── Global (${PATHS.SNIPPETS_DIR}) ──`, "");
    for (const s of globalSnippets) {
      lines.push(formatSnippetEntry(s), "");
    }
  }

  if (projectSnippets.length > 0) {
    lines.push(`── Project (${projectDir}/.pi/snippet/) ──`, "");
    for (const s of projectSnippets) {
      lines.push(formatSnippetEntry(s), "");
    }
  }

  // Use an ephemeral message via print mode or similar, or just a large notification
  // For long output, ui.notify might not be perfect but it's what we have.
  // Let's just use notify for now.
  ctx.ui.notify(lines.join("\n").trimEnd(), "info");
}

/**
 * Handle /snippet help
 */
async function handleHelpCommand(cmdCtx: CommandContext): Promise<void> {
  const { ctx } = cmdCtx;

  const helpText = `Snippets Command - Manage text snippets

Usage: /snippet <command> [options]

Commands:
  add <name> ["content"] [options]
    --project               Add to project directory (default: global)
    --aliases X,Y,Z         Add aliases (comma-separated)
    --desc "..."            Add a description

  delete <name>             Delete a snippet
  list                      List all available snippets
  help                      Show this help message

Snippet Locations:
  Global:  ~/.pi/agent/snippet/
  Project: <project>/.pi/snippet/

Usage in messages:
  Type #snippet-name to expand a snippet inline.
  Snippets can reference other snippets recursively.

Examples:
  /snippet add greeting
  /snippet add bye "see you later"
  /snippet add hi "hello there" --aliases hello,hey
  /snippet add fix "fix imports" --project
  /snippet delete old-snippet
  /snippet list`;

  ctx.ui.notify(helpText, "info");
}
