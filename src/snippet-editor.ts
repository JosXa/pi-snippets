import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme, TUI } from "@mariozechner/pi-tui";
import { SnippetAutocompleteProvider } from "./autocomplete.js";
import type { SnippetRegistry } from "./types.js";

/**
 * Custom editor that wraps the autocomplete provider with snippet completion.
 *
 * This is a thin wrapper around CustomEditor that intercepts
 * `setAutocompleteProvider` to inject our SnippetAutocompleteProvider
 * as a wrapper around whatever Pi provides (CombinedAutocompleteProvider).
 */
export class SnippetEditor extends CustomEditor {
  private snippetProvider: SnippetAutocompleteProvider | null = null;
  private snippets: SnippetRegistry;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    snippets: SnippetRegistry,
  ) {
    super(tui, theme, keybindings);
    this.snippets = snippets;
  }

  /**
   * Intercept setAutocompleteProvider to wrap with snippet completion.
   * Pi's interactive mode calls this after creating the editor.
   */
  override setAutocompleteProvider(provider: AutocompleteProvider): void {
    this.snippetProvider = new SnippetAutocompleteProvider(provider, this.snippets);
    super.setAutocompleteProvider(this.snippetProvider);
  }

  /**
   * Update the snippet registry (e.g. after reload).
   */
  updateSnippets(snippets: SnippetRegistry): void {
    this.snippets = snippets;
    if (this.snippetProvider) {
      this.snippetProvider.setSnippets(snippets);
    }
  }
}
