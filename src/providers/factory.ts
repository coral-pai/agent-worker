import type { Config } from "../config.ts";
import type { ProviderBundle } from "./types.ts";
import { createLinearProvider } from "./linear.ts";

export function createProvider(
  providerConfig: Config["provider"],
  lifecycle: Config["lifecycle"],
): ProviderBundle {
  switch (providerConfig.type) {
    case "linear":
      return createLinearProvider({
        projectId: providerConfig.linear.project_id,
        readyLabel: lifecycle.ready,
      });
    default: {
      const _exhaustive: never = providerConfig.type;
      throw new Error(`Unknown provider type: ${_exhaustive}`);
    }
  }
}
