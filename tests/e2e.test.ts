import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { PATHS } from "../src/constants.js";

const TEST_DIR = join(process.cwd(), "e2e-test-dir");

describe("E2E Integration", () => {
  beforeAll(async () => {
    // Setup test environment
    await mkdir(join(TEST_DIR, ".pi", "snippet"), { recursive: true });

    // Create a local snippet
    await writeFile(
      join(TEST_DIR, ".pi", "snippet", "test-snippet.md"),
      "Hello from pi-snippets integration test!",
    );
  });

  afterAll(async () => {
    // Cleanup
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.warn("Cleanup failed, likely due to file lock:", e);
    }
  });

  test("Pi expands snippet in CLI mode", async () => {
    // Run pi with our extension
    const extensionPath = join(process.cwd(), "extensions", "index.ts");

    // We use the --mode json or print to avoid interactive TUI, and pass the prompt directly
    const result =
      await $`cd ${TEST_DIR} && pi -p -e ${extensionPath} "Echo the following exactly: #test-snippet"`.nothrow();
    const output = result.text();
    console.log(output);
    expect(output).toContain("Hello from pi-snippets integration test!");
  }, 30000);
});
