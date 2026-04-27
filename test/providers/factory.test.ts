import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createProvider } from "../../src/providers/factory.ts";
import type { Config } from "../../src/config.ts";

const lifecycle: Config["lifecycle"] = {
  ready: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  failed: "Canceled",
};

let originalLinearKey: string | undefined;
let originalGitHubToken: string | undefined;

beforeEach(() => {
  originalLinearKey = process.env.LINEAR_API_KEY;
  originalGitHubToken = process.env.GITHUB_TOKEN;
  process.env.LINEAR_API_KEY = "test-key-xyz";
  process.env.GITHUB_TOKEN = "ghp_test_xyz";
});

afterEach(() => {
  if (originalLinearKey === undefined) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = originalLinearKey;
  if (originalGitHubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGitHubToken;
});

describe("createProvider", () => {
  test("returns ProviderBundle for linear type", () => {
    const bundle = createProvider(
      { type: "linear", poll_interval_seconds: 60, only_unassigned: true, linear: { project_id: "proj-1" } },
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
        { type: "linear", poll_interval_seconds: 60, only_unassigned: true, linear: { project_id: "proj-1" } },
        lifecycle,
      ),
    ).toThrow("LINEAR_API_KEY environment variable is required");
  });

  test("returns ProviderBundle for github type", () => {
    const bundle = createProvider(
      {
        type: "github",
        poll_interval_seconds: 60,
        only_unassigned: true,
        github: {
          owner: "acme",
          owner_type: "organization",
          project_number: 7,
          status_field_name: "Status",
        },
      },
      lifecycle,
    );

    expect(bundle.provider.name).toBe("GitHub Projects");
    expect(bundle.secrets).toEqual(["ghp_test_xyz"]);
  });

  test("throws when GITHUB_TOKEN is missing", () => {
    delete process.env.GITHUB_TOKEN;
    expect(() =>
      createProvider(
        {
          type: "github",
          poll_interval_seconds: 60,
          only_unassigned: true,
          github: {
            owner: "acme",
            owner_type: "organization",
            project_number: 7,
            status_field_name: "Status",
          },
        },
        lifecycle,
      ),
    ).toThrow("GITHUB_TOKEN environment variable is required");
  });

  test("throws on unknown provider type", () => {
    const fakeConfig = { type: "jira", jira: { base_url: "x" } } as unknown as Config["provider"];
    expect(() => createProvider(fakeConfig, lifecycle)).toThrow(/Unknown provider type/);
  });
});
