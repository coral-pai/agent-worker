import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createProvider } from "../../src/providers/factory.ts";
import type { Config } from "../../src/config.ts";

const lifecycle: Config["lifecycle"] = {
  ready: "Todo",
  in_progress: "In Progress",
  done: "Done",
  failed: "Canceled",
};

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY = "test-key-xyz";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = originalKey;
});

describe("createProvider", () => {
  test("returns ProviderBundle for linear type", () => {
    const bundle = createProvider(
      { type: "linear", poll_interval_seconds: 60, linear: { project_id: "proj-1" } },
      lifecycle,
    );

    expect(bundle.provider.name).toBe("Linear");
    expect(bundle.secrets).toEqual(["test-key-xyz"]);
    expect(typeof bundle.provider.fetchReadyTickets).toBe("function");
    expect(typeof bundle.provider.transitionStatus).toBe("function");
    expect(typeof bundle.provider.postComment).toBe("function");
  });

  test("throws when LINEAR_API_KEY is missing", () => {
    delete process.env.LINEAR_API_KEY;
    expect(() =>
      createProvider(
        { type: "linear", poll_interval_seconds: 60, linear: { project_id: "proj-1" } },
        lifecycle,
      ),
    ).toThrow("LINEAR_API_KEY environment variable is required");
  });

  test("throws on unknown provider type", () => {
    const fakeConfig = { type: "github", github: { repo: "owner/repo" } } as unknown as Config["provider"];
    expect(() => createProvider(fakeConfig, lifecycle)).toThrow(/Unknown provider type/);
  });
});
