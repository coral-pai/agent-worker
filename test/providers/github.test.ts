import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createGitHubProvider } from "../../src/providers/github.ts";

let originalToken: string | undefined;

beforeEach(() => {
  originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "ghp_test_token_xyz";
});

afterEach(() => {
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
});

const baseOptions = {
  owner: "acme",
  ownerType: "organization" as const,
  projectNumber: 1,
  statusFieldName: "Status",
  readyLabel: "Todo",
  onlyUnassigned: true,
};

describe("createGitHubProvider", () => {
  test("returns ProviderBundle with the expected name and exposed token", () => {
    const bundle = createGitHubProvider(baseOptions);

    expect(bundle.provider.name).toBe("GitHub Projects");
    expect(bundle.secrets).toEqual(["ghp_test_token_xyz"]);
    expect(typeof bundle.provider.fetchReadyTickets).toBe("function");
    expect(typeof bundle.provider.transitionStatus).toBe("function");
    expect(typeof bundle.provider.postComment).toBe("function");
  });

  test("throws when GITHUB_TOKEN is missing", () => {
    delete process.env.GITHUB_TOKEN;
    expect(() => createGitHubProvider(baseOptions)).toThrow(
      "GITHUB_TOKEN environment variable is required",
    );
  });

  test("transitionStatus rejects malformed ticket id", async () => {
    const bundle = createGitHubProvider(baseOptions);
    await expect(bundle.provider.transitionStatus("not-a-composite-id", "Done")).rejects.toThrow(
      /Invalid GitHub ticket id/,
    );
  });

  test("postComment rejects malformed ticket id", async () => {
    const bundle = createGitHubProvider(baseOptions);
    await expect(bundle.provider.postComment("nope", "hi")).rejects.toThrow(
      /Invalid GitHub ticket id/,
    );
  });
});
