import { beforeEach, describe, expect, it } from "bun:test";
import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";
import { SnippetAutocompleteProvider } from "../src/autocomplete.js";
import type { SnippetInfo, SnippetRegistry } from "../src/types.js";

/** Minimal mock provider that never returns suggestions */
class NoopProvider implements AutocompleteProvider {
  getSuggestions(): { items: AutocompleteItem[]; prefix: string } | null {
    return null;
  }
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _item: AutocompleteItem,
    _prefix: string,
  ) {
    return { lines, cursorLine, cursorCol };
  }
}

function makeSnippet(
  name: string,
  content: string,
  aliases: string[] = [],
  description?: string,
): SnippetInfo {
  return {
    name,
    content,
    aliases,
    description,
    filePath: `/test/${name}.md`,
    source: "global",
  };
}

function makeRegistry(...snippets: SnippetInfo[]): SnippetRegistry {
  const registry: SnippetRegistry = new Map();
  for (const s of snippets) {
    registry.set(s.name, s);
    for (const alias of s.aliases) {
      registry.set(alias, s);
    }
  }
  return registry;
}

describe("SnippetAutocompleteProvider", () => {
  let registry: SnippetRegistry;
  let provider: SnippetAutocompleteProvider;

  beforeEach(() => {
    registry = makeRegistry(
      makeSnippet("careful", "Think step by step.", ["safe"], "Be careful"),
      makeSnippet("git-status", "Show git status", ["gs"]),
      makeSnippet("code-style", "Follow best practices"),
    );
    provider = new SnippetAutocompleteProvider(new NoopProvider(), registry);
  });

  describe("getSuggestions", () => {
    it("should return all snippets when # is typed with no query", () => {
      const result = provider.getSuggestions(["#"], 0, 1);
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe("#");
      expect(result!.items.length).toBe(3);
      // Should be sorted alphabetically
      expect(result!.items[0]!.value).toBe("#careful");
      expect(result!.items[1]!.value).toBe("#code-style");
      expect(result!.items[2]!.value).toBe("#git-status");
    });

    it("should filter snippets by name prefix", () => {
      const result = provider.getSuggestions(["#ca"], 0, 3);
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe("#ca");
      expect(result!.items.length).toBe(1);
      expect(result!.items[0]!.value).toBe("#careful");
    });

    it("should match by alias", () => {
      const result = provider.getSuggestions(["#gs"], 0, 3);
      expect(result).not.toBeNull();
      expect(result!.items.length).toBe(1);
      expect(result!.items[0]!.value).toBe("#git-status");
    });

    it("should match by alias: safe -> careful", () => {
      const result = provider.getSuggestions(["#safe"], 0, 5);
      expect(result).not.toBeNull();
      expect(result!.items.length).toBe(1);
      expect(result!.items[0]!.value).toBe("#careful");
    });

    it("should return null when no snippets match", () => {
      const result = provider.getSuggestions(["#zzz"], 0, 4);
      expect(result).toBeNull();
    });

    it("should work mid-line after whitespace", () => {
      const result = provider.getSuggestions(["Review this #ca"], 0, 15);
      expect(result).not.toBeNull();
      expect(result!.prefix).toBe("#ca");
      expect(result!.items[0]!.value).toBe("#careful");
    });

    it("should NOT trigger when # is not preceded by whitespace or start of line", () => {
      // e.g. "foo#bar" should not trigger
      const result = provider.getSuggestions(["foo#bar"], 0, 7);
      expect(result).toBeNull();
    });

    it("should include description and aliases in autocomplete items", () => {
      const result = provider.getSuggestions(["#careful"], 0, 8);
      expect(result).not.toBeNull();
      const item = result!.items[0]!;
      expect(item.label).toBe("#careful");
      expect(item.description).toContain("Be careful");
      expect(item.description).toContain("#safe");
    });

    it("should use first line of content as description when no explicit description", () => {
      const result = provider.getSuggestions(["#code"], 0, 5);
      expect(result).not.toBeNull();
      const item = result!.items[0]!;
      expect(item.description).toContain("Follow best practices");
    });

    it("should delegate to wrapped provider when no # prefix", () => {
      const mockProvider: AutocompleteProvider = {
        getSuggestions: () => ({
          items: [{ value: "/test", label: "test" }],
          prefix: "/te",
        }),
        applyCompletion: (lines, cl, cc) => ({ lines, cursorLine: cl, cursorCol: cc }),
      };
      const wrappedProvider = new SnippetAutocompleteProvider(mockProvider, registry);
      const result = wrappedProvider.getSuggestions(["/te"], 0, 3);
      expect(result).not.toBeNull();
      expect(result!.items[0]!.value).toBe("/test");
    });
  });

  describe("applyCompletion", () => {
    it("should work mid-line without double spaces", () => {
      const item: AutocompleteItem = { value: "#careful", label: "#careful" };
      const result = provider.applyCompletion(["Review this #ca and more"], 0, 15, item, "#ca");
      // Should not add trailing space when text after cursor already starts with one
      expect(result.lines[0]).toBe("Review this #careful and more");
      expect(result.cursorCol).toBe(20); // "Review this #careful".length
    });

    it("should add trailing space at end of line", () => {
      const item: AutocompleteItem = { value: "#careful", label: "#careful" };
      const result = provider.applyCompletion(["#ca"], 0, 3, item, "#ca");
      expect(result.lines[0]).toBe("#careful ");
      expect(result.cursorCol).toBe(9); // "#careful ".length
    });
  });

  describe("setSnippets", () => {
    it("should update suggestions after setSnippets", () => {
      const newRegistry = makeRegistry(makeSnippet("new-snippet", "New content"));
      provider.setSnippets(newRegistry);

      const result = provider.getSuggestions(["#new"], 0, 4);
      expect(result).not.toBeNull();
      expect(result!.items[0]!.value).toBe("#new-snippet");

      // Old snippets should not appear
      const oldResult = provider.getSuggestions(["#careful"], 0, 8);
      expect(oldResult).toBeNull();
    });
  });
});
