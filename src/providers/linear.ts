import { LinearClient } from "@linear/sdk";
import type { ProviderBundle } from "./types.ts";
import { withBackoff, type IsRetryable } from "./_shared/backoff.ts";

const isLinearRateLimit: IsRetryable = (err) =>
  err instanceof Error &&
  (err.message.toLowerCase().includes("ratelimit") || err.message.includes("429"));

export function createLinearProvider(options: {
  projectId: string;
  readyLabel: string;
}): ProviderBundle {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable is required");
  }

  const client = new LinearClient({ apiKey });
  const stateCache = new Map<string, { id: string; name: string }[]>();

  async function getTeamStates(teamId: string): Promise<{ id: string; name: string }[]> {
    if (stateCache.has(teamId)) return stateCache.get(teamId)!;
    const team = await client.team(teamId);
    const states = await team.states();
    const nodes = states.nodes.map((s) => ({ id: s.id, name: s.name }));
    stateCache.set(teamId, nodes);
    return nodes;
  }

  return {
    provider: {
      name: "Linear",

      async fetchReadyTickets() {
        const issues = await withBackoff(
          () =>
            client.issues({
              filter: {
                project: { id: { eq: options.projectId } },
                state: { name: { eq: options.readyLabel } },
              },
            }),
          isLinearRateLimit,
        );

        return issues.nodes.map((issue) => ({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? undefined,
        }));
      },

      async transitionStatus(ticketId: string, statusName: string) {
        const issue = await withBackoff(() => client.issue(ticketId), isLinearRateLimit);
        const team = await issue.team;
        if (!team) throw new Error(`No team found for issue ${ticketId}`);

        const states = await getTeamStates(team.id);
        const target = states.find((s) => s.name === statusName);
        if (!target) throw new Error(`Status "${statusName}" not found on team`);

        await withBackoff(
          () => client.updateIssue(ticketId, { stateId: target.id }),
          isLinearRateLimit,
        );
      },

      async postComment(ticketId: string, body: string) {
        await withBackoff(
          () => client.createComment({ issueId: ticketId, body }),
          isLinearRateLimit,
        );
      },
    },
    secrets: [apiKey],
  };
}
