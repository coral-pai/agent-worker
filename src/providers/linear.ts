import { LinearClient } from "@linear/sdk";
import type { ProviderBundle } from "./types.ts";

const INITIAL_DELAY_MS = 1000;
const JITTER_MS = 500;
const MAX_DELAY_MS = 60000;
const MAX_BACKOFF_RETRIES = 5;

async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_BACKOFF_RETRIES
): Promise<T> {
  let delay = INITIAL_DELAY_MS;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        (err instanceof Error && err.message.toLowerCase().includes("ratelimit")) ||
        (err instanceof Error && err.message.includes("429"));

      if (!isRateLimit || attempt === maxRetries) throw err;

      const jitter = Math.random() * JITTER_MS;
      await Bun.sleep(delay + jitter);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }
  throw new Error("Unreachable");
}

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
        const issues = await withBackoff(() =>
          client.issues({
            filter: {
              project: { id: { eq: options.projectId } },
              state: { name: { eq: options.readyLabel } },
            },
          })
        );

        return issues.nodes.map((issue) => ({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? undefined,
        }));
      },

      async transitionStatus(ticketId: string, statusName: string) {
        const issue = await withBackoff(() => client.issue(ticketId));
        const team = await issue.team;
        if (!team) throw new Error(`No team found for issue ${ticketId}`);

        const states = await getTeamStates(team.id);
        const target = states.find((s) => s.name === statusName);
        if (!target) throw new Error(`Status "${statusName}" not found on team`);

        await withBackoff(() => client.updateIssue(ticketId, { stateId: target.id }));
      },

      async postComment(ticketId: string, body: string) {
        await withBackoff(() =>
          client.createComment({ issueId: ticketId, body })
        );
      },
    },
    secrets: [apiKey],
  };
}
