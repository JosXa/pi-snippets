import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { executeCommand } from "../src/commands.js";
import { loadConfig } from "../src/config.js";
import { assembleMessage, type ExpandOptions, expandHashtags } from "../src/expander.js";
import { InjectionManager } from "../src/injection-manager.js";
import { loadSnippets } from "../src/loader.js";
import { logger } from "../src/logger.js";
import { executeShellCommands } from "../src/shell.js";
import { loadSkills, type SkillRegistry } from "../src/skill-loader.js";
import { expandSkillTags } from "../src/skill-renderer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_DIR = join(__dirname, "..", "skills");

export default function snippetsExtension(pi: ExtensionAPI) {
  const injectionManager = new InjectionManager();
  let snippets = new Map();
  let skills: SkillRegistry = new Map();
  let config = loadConfig(); // loaded fully on session start

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
