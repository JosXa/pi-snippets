import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Regular expression patterns used throughout the plugin
 */
export const PATTERNS = {
  /** Matches hashtags like #snippet-name */
  HASHTAG: /#([a-z0-9\-_]+)/gi,

  /** Matches shell commands like !`command` */
  SHELL_COMMAND: /!`([^`]+)`/g,

  /**
   * Matches skill tags in two formats:
   * 1. Self-closing: <skill name="skill-name" /> or <skill name='skill-name'/>
   * 2. Block format: <skill>skill-name</skill>
   */
  SKILL_TAG_SELF_CLOSING: /<skill\s+name=["']([^"']+)["']\s*\/>/gi,
  SKILL_TAG_BLOCK: /<skill>([^<]+)<\/skill>/gi,
} as const;

/**
 * File system paths
 *
 * Snippets live in ~/.config/snippets — a tool-agnostic location shared by
 * both pi-snippets and opencode-snippets. This keeps your collection portable
 * across coding agents.
 */
export const PATHS = {
  /** Shared snippets directory (tool-agnostic) */
  SNIPPETS_DIR: join(homedir(), ".config", "snippets"),

  /** Global config file */
  CONFIG_FILE_GLOBAL: join(homedir(), ".config", "snippets", "config.jsonc"),

  /** Log directory */
  LOG_DIR: join(homedir(), ".config", "snippets", "logs"),
} as const;

/**
 * Get project-specific snippet directories.
 *
 * Both `.pi/snippets/` (preferred, plural) and `.pi/snippet/` (legacy, singular)
 * are supported and merged. New snippets are always written to the plural form.
 */
export function getProjectPaths(projectDir: string) {
  return {
    /** Preferred directory — new snippets go here */
    SNIPPETS_DIR: join(projectDir, ".pi", "snippets"),
    /** Legacy directory — read from but never written to */
    SNIPPETS_DIR_LEGACY: join(projectDir, ".pi", "snippet"),
    /** Config file (checked in both dirs) */
    CONFIG_FILE: join(projectDir, ".pi", "snippets", "config.jsonc"),
    CONFIG_FILE_LEGACY: join(projectDir, ".pi", "snippet", "config.jsonc"),
  };
}

/**
 * Plugin configuration
 */
export const CONFIG = {
  /** File extension for snippet files */
  SNIPPET_EXTENSION: ".md",
} as const;
