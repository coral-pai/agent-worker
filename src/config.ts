import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod/v4";

const LifecycleSchema = z.object({
  ready: z.string(),
  in_progress: z.string(),
  done: z.string(),
  failed: z.string(),
});

const LinearProviderSchema = z.object({
  type: z.literal("linear"),
  poll_interval_seconds: z.number().positive().default(60),
  linear: z.object({
    project_id: z.string(),
  }),
});

const ProviderSchema = z.discriminatedUnion("type", [
  LinearProviderSchema,
]);

const RepoSchema = z.object({
  path: z.string(),
});

const HooksSchema = z.object({
  pre: z.array(z.string()).default([]),
  post: z.array(z.string()).default([]),
}).default({ pre: [], post: [] });

const ExecutorSchema = z.object({
  type: z.enum(["claude", "codex"]).default("claude"),
  timeout_seconds: z.number().positive().default(300),
  retries: z.number().int().min(0).max(3).default(0),
}).default({ type: "claude", timeout_seconds: 300, retries: 0 });

const LogSchema = z.object({
  file: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).default({ level: "info" });

const ConfigFileSchema = z.object({
  provider: ProviderSchema,
  lifecycle: LifecycleSchema,
  repo: RepoSchema,
  hooks: HooksSchema,
  executor: ExecutorSchema,
  log: LogSchema,
});

export type Config = z.infer<typeof ConfigFileSchema>;

export function loadConfig(filePath: string): Config {
  const text = readFileSync(filePath, "utf-8");
  const raw = parseYaml(text) as Record<string, unknown>;

  if (raw.linear && !raw.provider) {
    throw new Error(
      "Config schema changed: top-level `linear:` is now `provider: { type: linear, " +
      "poll_interval_seconds, linear: { project_id } }` plus a sibling `lifecycle:` block. " +
      "See README for the new shape."
    );
  }

  // Backward compat: map `claude` key to `executor` with type "claude"
  if (raw.claude && !raw.executor) {
    raw.executor = { ...(raw.claude as Record<string, unknown>), type: "claude" };
    delete raw.claude;
  }

  return ConfigFileSchema.parse(raw);
}
