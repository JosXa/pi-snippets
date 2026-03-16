import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider } from "@mariozechner/pi-tui";
import { SnippetAutocompleteProvider } from "./src/autocomplete.js";
import { executeCommand } from "./src/commands.js";
import { loadConfig } from "./src/config.js";
import { assembleMessage, type ExpandOptions, expandHashtags } from "./src/expander.js";
import { InjectionManager } from "./src/injection-manager.js";
import { loadSnippets } from "./src/loader.js";
import { logger } from "./src/logger.js";
import { executeShellCommands } from "./src/shell.js";
import { loadSkills, type SkillRegistry } from "./src/skill-loader.js";
import { expandSkillTags } from "./src/skill-renderer.js";
import { SnippetEditor } from "./src/snippet-editor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_DIR = join(__dirname, "skills");
const ORIGINAL_SET_EDITOR_KEY = "__piSnippetsOriginalSetEditor";
const HASH_TRIGGER_PATCHED_KEY = "__piSnippetsHashTriggerPatched";
const AUTOCOMPLETE_PATCHED_KEY = "__piSnippetsAutocompletePatched";

export default function snippetsExtension(pi: ExtensionAPI) {
  const injectionManager = new InjectionManager();
  let snippets = new Map();
  let skills: SkillRegistry = new Map();
  let config = loadConfig(); // loaded fully on session start
  let snippetProvider: SnippetAutocompleteProvider | null = null;

  // 1. Register bundled skills
  pi.on("resources_discover", () => {
    return {
      skillPaths: [join(SKILL_DIR, "snippets", "SKILL.md")],
    };
  });

  // 2. Command registration
  pi.registerCommand("snippet", {
    description: "Manage text snippets (add, delete, list, help)",
    handler: async (args, ctx) => {
      await executeCommand(args, ctx, snippets, ctx.cwd);
    },
  });

  // 3. Load config and snippets on session start
  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    logger.debugEnabled = config.logging.debug;

    snippets = await loadSnippets(ctx.cwd);

    if (config.experimental.skillRendering) {
      skills = await loadSkills(ctx.cwd);
    }

    // Install snippet autocomplete in an editor-agnostic way.
    //
    // Problem: setEditorComponent is last-write-wins. If another extension
    // (e.g. pi-vim) calls it after us, our SnippetEditor is replaced and
    // autocomplete is lost.
    //
    // Additionally, pi-tui's Editor only auto-triggers autocomplete for
    // "/" and "@" — not "#". We need to patch the editor to also trigger
    // on "#" so our SnippetAutocompleteProvider.getSuggestions gets called.
    //
    // Strategy:
    // 1. Set SnippetEditor as default (works when no other editor extension)
    // 2. Monkey-patch setEditorComponent so future editors also get:
    //    a) setAutocompleteProvider wrapped with SnippetAutocompleteProvider
    //    b) handleInput patched to trigger autocomplete on "#"
    const ui = ctx.ui as any;
    const originalSetEditor =
      ui[ORIGINAL_SET_EDITOR_KEY]?.bind(ui) ?? ui.setEditorComponent.bind(ui);
    ui[ORIGINAL_SET_EDITOR_KEY] = originalSetEditor;

    // Step 1: Set our SnippetEditor as the default
    originalSetEditor((tui: any, theme: any, keybindings: any) => {
      const editor = new SnippetEditor(tui, theme, keybindings, snippets);
      patchHashTrigger(editor);
      return editor;
    });

    // Step 2: Patch setEditorComponent for any future callers (e.g. pi-vim)
    ui.setEditorComponent = (factory: any) => {
      if (!factory) {
        originalSetEditor(undefined);
        return;
      }
      originalSetEditor((tui: any, theme: any, kb: any) => {
        const editor = factory(tui, theme, kb);
        patchAutocompleteProvider(editor, snippets, (provider) => {
          snippetProvider = provider;
        });
        patchHashTrigger(editor);
        return editor;
      });
    };

    logger.debug("Snippets extension loaded", {
      snippetCount: snippets.size,
      skillCount: skills.size,
    });
  });

  // 4. Transform user input
  pi.on("input", async (event, ctx) => {
    if (!event.text) return { action: "continue" };

    const expandOptions: ExpandOptions = {
      extractInject: config.experimental.injectBlocks,
    };

    let text = event.text;

    // 4a. Expand skill tags
    if (config.experimental.skillRendering && skills.size > 0) {
      text = expandSkillTags(text, skills);
    }

    // 4b. Expand hashtags
    const expansionResult = expandHashtags(text, snippets, new Map(), expandOptions);
    text = assembleMessage(expansionResult);

    // 4c. Execute shell commands
    if (text.includes("!`")) {
      text = await executeShellCommands(
        text,
        { pi },
        {
          hideCommandInOutput: config.hideCommandInOutput,
        },
      );
    }

    // Save inject blocks
    if (expansionResult.inject.length > 0) {
      injectionManager.addInjections(
        ctx.sessionManager.getSessionFile() || "ephemeral",
        expansionResult.inject,
      );
    }

    if (text !== event.text) {
      return { action: "transform", text };
    }

    return { action: "continue" };
  });

  // 5. Inject blocks via system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile() || "ephemeral";
    const injections = injectionManager.getInjections(sessionId);

    if (injections && injections.length > 0) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${injections.join("\n\n")}`,
      };
    }
  });

  // 6. Cleanup inject blocks on agent end
  pi.on("agent_end", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile() || "ephemeral";
    injectionManager.clearSession(sessionId);
  });
}

/**
 * Patch an editor's handleInput to trigger autocomplete on "#".
 *
 * Pi-tui's Editor only auto-triggers autocomplete for "/" (slash commands)
 * and "@" (file references). We need "#" to also trigger it so that
 * SnippetAutocompleteProvider.getSuggestions gets called.
 *
 * We also need to keep autocomplete alive when typing alphanumeric chars
 * in a "#" context (e.g. "#abc") — the editor already does this via
 * updateAutocomplete() when autocompleteState is set, so we only need
 * to handle the initial "#" trigger.
 *
 * Additionally, we trigger on alphanumeric chars when the cursor is in a
 * "#..." context (after autocomplete was cancelled due to zero matches,
 * then the user backspaces into a valid prefix again).
 */
function patchAutocompleteProvider(
  editor: any,
  snippets: Map<string, any>,
  onWrapped: (provider: SnippetAutocompleteProvider) => void,
): void {
  if (
    !editor ||
    typeof editor.setAutocompleteProvider !== "function" ||
    editor[AUTOCOMPLETE_PATCHED_KEY]
  ) {
    return;
  }

  const originalSetAutocompleteProvider = editor.setAutocompleteProvider.bind(editor);
  editor[AUTOCOMPLETE_PATCHED_KEY] = true;
  editor.setAutocompleteProvider = (provider: AutocompleteProvider) => {
    const wrapped = new SnippetAutocompleteProvider(provider, snippets);
    onWrapped(wrapped);
    originalSetAutocompleteProvider(wrapped);
  };
}

function patchHashTrigger(editor: any): void {
  if (!editor || typeof editor.handleInput !== "function" || editor[HASH_TRIGGER_PATCHED_KEY]) {
    return;
  }

  const originalHandleInput = editor.handleInput.bind(editor);
  editor[HASH_TRIGGER_PATCHED_KEY] = true;

  editor.handleInput = (data: string) => {
    // Let the editor process the input first (insert char, move cursor, etc.)
    originalHandleInput(data);

    // Now check if we need to trigger/update autocomplete for "#"
    // Only act on single printable characters
    if (data.length !== 1 || data.charCodeAt(0) < 32) return;

    const char = data;
    const state = editor.autocompleteState;
    const lines: string[] = editor.getLines?.() ?? editor.state?.lines;
    const cursor = editor.getCursor?.() ?? { line: editor.state?.cursorLine, col: editor.state?.cursorCol };
    if (!lines || cursor.line == null || cursor.col == null) return;

    const currentLine = lines[cursor.line] || "";
    const textBeforeCursor = currentLine.slice(0, cursor.col);

    if (!state) {
      // No autocomplete active — trigger on "#" at start or after whitespace
      if (char === "#") {
        const charBefore = textBeforeCursor[textBeforeCursor.length - 2];
        if (textBeforeCursor.length === 1 || charBefore === " " || charBefore === "\t") {
          editor.tryTriggerAutocomplete?.();
        }
      }
      // Also trigger on alphanumeric if we're in a #hashtag context
      // (e.g. user typed #ab, autocomplete was cancelled, they backspaced
      // and retyped — we need to re-trigger)
      else if (/[a-zA-Z0-9_-]/.test(char) && textBeforeCursor.match(/(?:^|[\s])#[^\s]*$/)) {
        editor.tryTriggerAutocomplete?.();
      }
    }
    // If autocomplete IS active, updateAutocomplete() is already called by
    // the original handleInput — no action needed from us.
  };
}
