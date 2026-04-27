import { graphql } from "@octokit/graphql";
import type { ProviderBundle, Ticket } from "./types.ts";
import { withBackoff, type IsRetryable } from "./_shared/backoff.ts";

const isGitHubRateLimit: IsRetryable = (err) => {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("ratelimit") ||
    m.includes("429") ||
    m.includes("secondary rate limit") ||
    m.includes("abuse detection")
  );
};

type ProjectMeta = {
  projectId: string;
  statusFieldId: string;
  optionsByName: Map<string, string>;
};

type ProjectV2SingleSelectField = {
  id: string;
  options: { id: string; name: string }[];
};

function encodeId(projectItemId: string, issueId: string): string {
  return `${projectItemId}|${issueId}`;
}

function decodeId(id: string): { projectItemId: string; issueId: string } {
  const sep = id.indexOf("|");
  if (sep === -1) throw new Error(`Invalid GitHub ticket id (expected "<projectItemId>|<issueId>"): ${id}`);
  return { projectItemId: id.slice(0, sep), issueId: id.slice(sep + 1) };
}

export function createGitHubProvider(options: {
  owner: string;
  ownerType: "organization" | "user";
  projectNumber: number;
  statusFieldName: string;
  readyLabel: string;
}): ProviderBundle {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const gql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  let metaCache: ProjectMeta | null = null;

  async function getProjectMeta(): Promise<ProjectMeta> {
    if (metaCache) return metaCache;

    const ownerField = options.ownerType === "organization" ? "organization" : "user";
    const query = `
      query($owner: String!, $number: Int!, $statusFieldName: String!) {
        ${ownerField}(login: $owner) {
          projectV2(number: $number) {
            id
            field(name: $statusFieldName) {
              ... on ProjectV2SingleSelectField {
                id
                options { id name }
              }
            }
          }
        }
      }
    `;

    const data = await withBackoff(
      () =>
        gql<Record<string, { projectV2: { id: string; field: ProjectV2SingleSelectField | null } | null } | null>>(
          query,
          {
            owner: options.owner,
            number: options.projectNumber,
            statusFieldName: options.statusFieldName,
          },
        ),
      isGitHubRateLimit,
    );

    const project = data[ownerField]?.projectV2;
    if (!project) {
      throw new Error(`GitHub project not found: ${options.owner}/#${options.projectNumber} (${ownerField})`);
    }
    if (!project.field) {
      throw new Error(`Status field "${options.statusFieldName}" not found or is not a single-select field on project ${options.owner}/#${options.projectNumber}`);
    }

    metaCache = {
      projectId: project.id,
      statusFieldId: project.field.id,
      optionsByName: new Map(project.field.options.map((o) => [o.name, o.id])),
    };
    return metaCache;
  }

  type ItemNode = {
    id: string;
    fieldValueByName: { optionId: string } | null;
    content:
      | {
          __typename: "Issue";
          id: string;
          number: number;
          title: string;
          body: string | null;
          repository: { nameWithOwner: string };
        }
      | { __typename: "PullRequest" | "DraftIssue" }
      | null;
  };

  return {
    provider: {
      name: "GitHub Projects",

      async fetchReadyTickets(): Promise<Ticket[]> {
        const meta = await getProjectMeta();
        const targetOptionId = meta.optionsByName.get(options.readyLabel);
        if (!targetOptionId) {
          throw new Error(`Status "${options.readyLabel}" is not an option on the "${options.statusFieldName}" field`);
        }

        const query = `
          query($projectId: ID!, $cursor: String, $statusFieldName: String!) {
            node(id: $projectId) {
              ... on ProjectV2 {
                items(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    id
                    fieldValueByName(name: $statusFieldName) {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        optionId
                      }
                    }
                    content {
                      __typename
                      ... on Issue {
                        id
                        number
                        title
                        body
                        repository { nameWithOwner }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const tickets: Ticket[] = [];
        let cursor: string | null = null;

        while (true) {
          const data = await withBackoff(
            () =>
              gql<{ node: { items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ItemNode[] } } }>(
                query,
                { projectId: meta.projectId, cursor, statusFieldName: options.statusFieldName },
              ),
            isGitHubRateLimit,
          );

          for (const node of data.node.items.nodes) {
            if (node.fieldValueByName?.optionId !== targetOptionId) continue;
            if (!node.content || node.content.__typename !== "Issue") continue;
            tickets.push({
              id: encodeId(node.id, node.content.id),
              identifier: `${node.content.repository.nameWithOwner}#${node.content.number}`,
              title: node.content.title,
              description: node.content.body ?? undefined,
            });
          }

          if (!data.node.items.pageInfo.hasNextPage) break;
          cursor = data.node.items.pageInfo.endCursor;
        }

        return tickets;
      },

      async transitionStatus(ticketId: string, statusName: string) {
        const { projectItemId } = decodeId(ticketId);
        const meta = await getProjectMeta();
        const optionId = meta.optionsByName.get(statusName);
        if (!optionId) {
          throw new Error(`Status "${statusName}" is not an option on the "${options.statusFieldName}" field`);
        }

        const mutation = `
          mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: { singleSelectOptionId: $optionId }
            }) {
              projectV2Item { id }
            }
          }
        `;

        await withBackoff(
          () =>
            gql(mutation, {
              projectId: meta.projectId,
              itemId: projectItemId,
              fieldId: meta.statusFieldId,
              optionId,
            }),
          isGitHubRateLimit,
        );
      },

      async postComment(ticketId: string, body: string) {
        const { issueId } = decodeId(ticketId);

        const mutation = `
          mutation($subjectId: ID!, $body: String!) {
            addComment(input: { subjectId: $subjectId, body: $body }) {
              commentEdge { node { id } }
            }
          }
        `;

        await withBackoff(
          () => gql(mutation, { subjectId: issueId, body }),
          isGitHubRateLimit,
        );
      },
    },
    secrets: [token],
  };
}
