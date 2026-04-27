import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { printSplash } from "./format.ts";
import { createProvider } from "./providers/factory.ts";
import { createPoller } from "./poller.ts";
import { processTicket } from "./scheduler.ts";
import { version } from "../package.json";

function main() {
  if (process.argv.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  const configIndex = process.argv.indexOf("--config");
  if (configIndex === -1 || !process.argv[configIndex + 1]) {
    console.error("Usage: agent-worker --config <path>");
    process.exit(1);
  }

  const configPath = process.argv[configIndex + 1]!;

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    console.error(
      "Configuration error:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  let bundle;
  try {
    bundle = createProvider(config.provider, config.lifecycle);
  } catch (err) {
    console.error(
      "Provider error:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  const logger = createLogger({
    level: config.log.level,
    filePath: config.log.file,
    redact: bundle.secrets,
  });

  const poller = createPoller({
    provider: bundle.provider,
    intervalMs: config.provider.poll_interval_seconds * 1000,
    logger,
    onTicket: async (ticket) => {
      await processTicket({ ticket, provider: bundle.provider, config, logger });
    },
  });

  printSplash(version, {
    provider: bundle.provider.name,
    executor: config.executor.type,
    repoPath: config.repo.path,
  });

  logger.info("Agent Worker started", {
    provider: bundle.provider.name,
    pollInterval: config.provider.poll_interval_seconds,
    executor: config.executor.type,
  });

  process.on("SIGINT", () => {
    logger.info("Shutting down", { signal: "SIGINT" });
    poller.stop();
  });
  process.on("SIGTERM", () => {
    logger.info("Shutting down", { signal: "SIGTERM" });
    poller.stop();
  });

  poller.start().then(() => {
    process.exit(0);
  }).catch((err) => {
    logger.error("Fatal error", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}

main();
