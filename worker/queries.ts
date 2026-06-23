export interface Query {
  ring: 1 | 2 | 3;
  text: string;
  enabled: boolean;
}

export const QUERIES: Query[] = [
  {
    ring: 1,
    enabled: true,
    text: '("virtual mailbox" OR "virtual address" OR "mail forwarding" OR "mail scanning") (need OR recommend OR "looking for" OR best OR alternative OR vs) -is:retweet lang:en'
  },
  {
    ring: 1,
    enabled: true,
    text: '("registered agent" OR "business address") (need OR recommend OR "looking for" OR cheap) -is:retweet -hiring lang:en'
  },
  {
    ring: 1,
    enabled: true,
    text: '("po box" OR "street address") ("for my llc" OR "for my business" OR "receive packages") -is:retweet lang:en'
  },
  {
    ring: 2,
    enabled: true,
    text: '("3pl" OR fulfillment OR "third party logistics") (startup OR "small business" OR "low volume" OR recommend) -is:retweet -hiring lang:en'
  },
  {
    ring: 2,
    enabled: true,
    text: '("scan my mail" OR "open my mail" OR "mail I can\'t get") -is:retweet lang:en'
  },
  {
    ring: 2,
    enabled: true,
    text: '("multiple llc" OR "multiple entities" OR "holding company") (mail OR address OR "registered agent") -is:retweet lang:en'
  },
  {
    ring: 3,
    enabled: true,
    text: '("AI agent" OR "autonomous agent" OR "my AI") (mail OR package OR shipping OR "physical address" OR "real world") -is:retweet lang:en'
  },
  {
    ring: 3,
    enabled: true,
    text: '(MCP OR "tool calling" OR "give my agent") (mail OR shipping OR address OR fulfillment OR physical) -is:retweet lang:en'
  }
];
