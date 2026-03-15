import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";
import { fuzzyFilter } from "@mariozechner/pi-tui";
import type { SnippetRegistry } from "./types.js";

/**
 * Autocomplete provider that adds #snippet completion to the editor.
 *
 * Wraps an existing provider (the built-in CombinedAutocompleteProvider) and
 * intercepts `#` prefixes to show snippet suggestions. Everything else is
 * delegated to the wrapped provider.
 */
export class SnippetAutocompleteProvider implements AutocompleteProvider {
  private wrapped: AutocompleteProvider;
  private snippets: SnippetRegistry;

  constructor(wrapped: AutocompleteProvider, snippets: SnippetRegistry) {
    this.wrapped = wrapped;
    this.snippets = snippets;
  }

  /** Update the snippet registry (e.g. after reload). */
  setSnippets(snippets: SnippetRegistry): void {
    this.snippets = snippets;
  }

  /** Update the wrapped provider (e.g. when Pi refreshes commands). */
  setWrapped(wrapped: AutocompleteProvider): void {
    this.wrapped = wrapped;
  }

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);

    // Check for #snippet trigger
    const hashPrefix = this.extractHashPrefix(textBeforeCursor);
    if (hashPrefix !== null) {
      const query = hashPrefix.slice(1); // strip the leading #
      const items = this.getSnippetSuggestions(query);
      if (items.length === 0) return null;
      return { items, prefix: hashPrefix };
    }

    // Delegate to wrapped provider
    return this.wrapped.getSuggestions(lines, cursorLine, cursorCol);
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    // If this is a snippet completion (prefix starts with #), handle it ourselves
    if (prefix.startsWith("#")) {
      const currentLine = lines[cursorLine] || "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      // Add trailing space only if the text after cursor doesn't already start with one
      const needsSpace = afterCursor.length === 0 || afterCursor[0] !== " ";
      const separator = needsSpace ? " " : "";
      const newLine = `${beforePrefix}${item.value}${separator}${afterCursor}`;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;
      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + separator.length,
      };
    }

    // Delegate to wrapped provider
    return this.wrapped.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  /**
   * Extract a #hashtag prefix from text before cursor.
   * Returns the prefix (including #) or null if not in a hashtag context.
   *
   * Triggers on `#` followed by zero or more word characters [a-z0-9_-].
   * The `#` must be at the start of text or preceded by whitespace.
   */
  private extractHashPrefix(text: string): string | null {
    // Walk backwards from end to find the # trigger
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i]!;
      if (ch === "#") {
        // # must be at start or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1]!)) {
          return text.slice(i);
        }
        return null;
      }
      // Only allow hashtag characters after #
      if (!/[a-z0-9_-]/i.test(ch)) {
        return null;
      }
    }
    return null;
  }

  /**
   * Build autocomplete items from the snippet registry, filtered by query.
   */
  private getSnippetSuggestions(query: string): AutocompleteItem[] {
    // Build a deduped list of snippet items (one per unique snippet, not per alias)
    const seen = new Set<string>();
    const candidates: {
      name: string;
      snippet: { name: string; aliases: string[]; description?: string; content: string };
    }[] = [];

    for (const [key, info] of this.snippets) {
      // The registry maps both names and aliases to the same SnippetInfo.
      // We only want to show each snippet once, keyed by its primary name.
      if (seen.has(info.name)) continue;
      seen.add(info.name);

      candidates.push({
        name: info.name,
        snippet: info,
      });
    }

    // If no query, return all snippets sorted alphabetically
    if (!query) {
      return candidates
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => this.toAutocompleteItem(c.snippet));
    }

    // Use fuzzy filter for matching — match against name and all aliases
    type CandidateEntry = { searchText: string; snippet: (typeof candidates)[0]["snippet"] };
    const searchEntries: CandidateEntry[] = [];
    for (const c of candidates) {
      // Add the primary name
      searchEntries.push({ searchText: c.name, snippet: c.snippet });
      // Add each alias as a separate search entry (same snippet)
      for (const alias of c.snippet.aliases) {
        searchEntries.push({ searchText: alias, snippet: c.snippet });
      }
    }

    const matched = fuzzyFilter(searchEntries, query, (entry) => entry.searchText);

    // Dedupe results (multiple aliases for same snippet can match)
    const resultSeen = new Set<string>();
    const results: AutocompleteItem[] = [];
    for (const entry of matched) {
      if (resultSeen.has(entry.snippet.name)) continue;
      resultSeen.add(entry.snippet.name);
      results.push(this.toAutocompleteItem(entry.snippet));
    }

    return results;
  }

  /**
   * Convert a snippet to an AutocompleteItem.
   */
  private toAutocompleteItem(snippet: {
    name: string;
    aliases: string[];
    description?: string;
    content: string;
  }): AutocompleteItem {
    // Build description: use explicit description if available, otherwise first line of content
    let description = snippet.description;
    if (!description) {
      const firstLine = snippet.content.trim().split("\n")[0]?.trim();
      if (firstLine) {
        description = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
      }
    }

    // Show aliases in description if present
    if (snippet.aliases.length > 0) {
      const aliasText = snippet.aliases.map((a) => `#${a}`).join(", ");
      description = description ? `${description}  [${aliasText}]` : aliasText;
    }

    return {
      value: `#${snippet.name}`,
      label: `#${snippet.name}`,
      ...(description && { description }),
    };
  }

  // Delegate force file suggestions to the wrapped provider (for Tab completion)
  getForceFileSuggestions?(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): { items: AutocompleteItem[]; prefix: string } | null {
    const wrapped = this.wrapped as any;
    if (typeof wrapped.getForceFileSuggestions === "function") {
      return wrapped.getForceFileSuggestions(lines, cursorLine, cursorCol);
    }
    return null;
  }

  shouldTriggerFileCompletion?(lines: string[], cursorLine: number, cursorCol: number): boolean {
    const wrapped = this.wrapped as any;
    if (typeof wrapped.shouldTriggerFileCompletion === "function") {
      return wrapped.shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
    }
    return true;
  }
}
