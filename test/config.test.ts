import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpDir: string;

function writeConfig(content: string): string {
  const path = join(tmpDir, "config.yaml");
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agent-worker-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe("loadConfig", () => {
  const validYaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
`;

  test("parses valid config with defaults", () => {
    const config = loadConfig(writeConfig(validYaml));

    expect(config.provider.type).toBe("linear");
    if (config.provider.type === "linear") {
      expect(config.provider.linear.project_id).toBe("proj-123");
      expect(config.provider.poll_interval_seconds).toBe(60);
    }
    expect(config.lifecycle.ready).toBe("Todo");
    expect(config.repo.path).toBe("/tmp/repo");
    expect(config.hooks.pre).toEqual([]);
    expect(config.hooks.post).toEqual([]);
    expect(config.executor.type).toBe("claude");
    expect(config.executor.timeout_seconds).toBe(300);
    expect(config.executor.retries).toBe(0);
    expect(config.log.level).toBe("info");
  });

  test("parses config with executor fields set", () => {
    const fullYaml = `
provider:
  type: linear
  poll_interval_seconds: 30
  linear:
    project_id: "proj-456"
lifecycle:
  ready: "Ready"
  in_progress: "Working"
  done: "Complete"
  failed: "Failed"
repo:
  path: "/home/user/project"
hooks:
  pre:
    - "git pull"
    - "git checkout -b feature"
  post:
    - "npm test"
executor:
  type: claude
  timeout_seconds: 600
  retries: 2
log:
  file: "./test.log"
`;
    const config = loadConfig(writeConfig(fullYaml));

    if (config.provider.type === "linear") {
      expect(config.provider.poll_interval_seconds).toBe(30);
    }
    expect(config.hooks.pre).toEqual(["git pull", "git checkout -b feature"]);
    expect(config.hooks.post).toEqual(["npm test"]);
    expect(config.executor.type).toBe("claude");
    expect(config.executor.timeout_seconds).toBe(600);
    expect(config.executor.retries).toBe(2);
    expect(config.log.file).toBe("./test.log");
  });

  test("parses config with codex executor", () => {
    const yaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
executor:
  type: codex
  timeout_seconds: 120
`;
    const config = loadConfig(writeConfig(yaml));
    expect(config.executor.type).toBe("codex");
    expect(config.executor.timeout_seconds).toBe(120);
  });

  test("backward compat: maps claude key to executor", () => {
    const yaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
claude:
  timeout_seconds: 600
  retries: 2
`;
    const config = loadConfig(writeConfig(yaml));
    expect(config.executor.type).toBe("claude");
    expect(config.executor.timeout_seconds).toBe(600);
    expect(config.executor.retries).toBe(2);
  });

  test("throws helpful error when legacy `linear:` top-level key is used", () => {
    const yaml = `
linear:
  project_id: "proj-123"
  statuses:
    ready: "Todo"
    in_progress: "In Progress"
    done: "Done"
    failed: "Canceled"
repo:
  path: "/tmp/repo"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow(
      /Config schema changed/
    );
  });

  test("throws on missing project_id", () => {
    const yaml = `
provider:
  type: linear
  linear: {}
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });

  test("throws on missing lifecycle", () => {
    const yaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
repo:
  path: "/tmp/repo"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });

  test("throws on missing repo path", () => {
    const yaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });

  test("rejects unknown provider type", () => {
    const yaml = `
provider:
  type: github
  github:
    repo: "owner/repo"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });

  test("rejects retries greater than 3", () => {
    const yaml = `
provider:
  type: linear
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
executor:
  retries: 5
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });

  test("rejects negative poll interval", () => {
    const yaml = `
provider:
  type: linear
  poll_interval_seconds: -1
  linear:
    project_id: "proj-123"
lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  done: "Done"
  failed: "Canceled"
repo:
  path: "/tmp/repo"
`;
    expect(() => loadConfig(writeConfig(yaml))).toThrow();
  });
});
