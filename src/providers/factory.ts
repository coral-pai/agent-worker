import type { Config } from "../config.ts";
import type { ProviderBundle } from "./types.ts";
import { createLinearProvider } from "./linear.ts";
import { createGitHubProvider } from "./github.ts";

export function createProvider(
  providerConfig: Config["provider"],
  lifecycle: Config["lifecycle"],
): ProviderBundle {
  switch (providerConfig.type) {
    case "linear":
      return createLinearProvider({
        projectId: providerConfig.linear.project_id,
        readyLabel: lifecycle.ready,
        onlyUnassigned: providerConfig.only_unassigned,
      });
    case "github":
      return createGitHubProvider({
        owner: providerConfig.github.owner,
        ownerType: providerConfig.github.owner_type,
        projectNumber: providerConfig.github.project_number,
        statusFieldName: providerConfig.github.status_field_name,
        readyLabel: lifecycle.ready,
        onlyUnassigned: providerConfig.only_unassigned,
      });
    default: {
      const _exhaustive: never = providerConfig;
      throw new Error(`Unknown provider type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}
