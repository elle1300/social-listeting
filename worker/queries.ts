export interface Query {
  ring: 1 | 2 | 3;
  tag: string;
  text: string;
  enabled: boolean;
}

export const LOW_VOLUME_PROBE_QUERY: Query = {
  ring: 1,
  tag: "hello:postal-mcp-ai-address:v1",
  enabled: true,
  text: '((postal mail mcp) OR ("ai agent" "physical address")) -is:retweet lang:en'
};

export const QUERIES: Query[] = [
  {
    ring: 1,
    tag: "pain:virtual-mailbox:v1",
    enabled: true,
    text: '("virtual mailbox" OR "virtual address" OR "mail forwarding" OR "mail scanning") (need OR recommend OR "looking for" OR best OR alternative OR vs) -is:retweet lang:en'
  },
  {
    ring: 1,
    tag: "pain:registered-agent-address:v1",
    enabled: true,
    text: '("registered agent" OR "business address") (need OR recommend OR "looking for" OR cheap) -is:retweet -hiring lang:en'
  },
  {
    ring: 1,
    tag: "pain:po-box-business-address:v1",
    enabled: true,
    text: '("po box" OR "street address") ("for my llc" OR "for my business" OR "receive packages") -is:retweet lang:en'
  },
  {
    ring: 2,
    tag: "pain:low-volume-3pl:v1",
    enabled: true,
    text: '("3pl" OR fulfillment OR "third party logistics") (startup OR "small business" OR "low volume" OR recommend) -is:retweet -hiring lang:en'
  },
  {
    ring: 2,
    tag: "pain:mail-scanning:v1",
    enabled: true,
    text: '("scan my mail" OR "open my mail" OR "mail I can\'t get") -is:retweet lang:en'
  },
  {
    ring: 2,
    tag: "pain:multi-entity-mail:v1",
    enabled: true,
    text: '("multiple llc" OR "multiple entities" OR "holding company") (mail OR address OR "registered agent") -is:retweet lang:en'
  },
  {
    ring: 3,
    tag: "agent:physical-address:v1",
    enabled: true,
    text: '("AI agent" OR "autonomous agent" OR "my AI") (mail OR package OR shipping OR "physical address" OR "real world") -is:retweet lang:en'
  },
  {
    ring: 3,
    tag: "agent:mcp-mail-shipping:v1",
    enabled: true,
    text: '(MCP OR "tool calling" OR "give my agent") (mail OR shipping OR address OR fulfillment OR physical) -is:retweet lang:en'
  }
];

function envFlag(name: string): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function getQueries(): Query[] {
  const helloWorldQuery = process.env.SOCIAL_LISTENING_QUERY?.trim();
  if (helloWorldQuery) {
    return [
      {
        ring: 1,
        tag: process.env.SOCIAL_LISTENING_QUERY_TAG?.trim() || "hello:keyword-combo:v1",
        enabled: true,
        text: helloWorldQuery
      }
    ];
  }

  if (envFlag("SOCIAL_LISTENING_ENABLE_DEFAULT_QUERIES")) {
    return QUERIES;
  }

  return [LOW_VOLUME_PROBE_QUERY];
}
