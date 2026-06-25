import type { SocialEvent } from "./events";

const X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

interface RecentSearchResult {
  newestId?: string;
  nextToken?: string;
  resultCount: number;
  events: SocialEvent[];
}

interface XTweet {
  id: string;
  text: string;
  author_id?: string;
  conversation_id?: string;
  created_at?: string;
}

interface XUser {
  id: string;
  username?: string;
}

interface XSearchResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
  };
  meta?: {
    newest_id?: string;
    next_token?: string;
    result_count?: number;
  };
}

export async function recentSearch(
  query: string,
  sinceId?: string,
  matchedRuleTag = "hello:recent-search:v1"
): Promise<RecentSearchResult> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error("X_BEARER_TOKEN is required");
  }

  const params = new URLSearchParams({
    query,
    max_results: process.env.X_SEARCH_MAX_RESULTS ?? "10",
    "tweet.fields": "author_id,conversation_id,created_at",
    expansions: "author_id",
    "user.fields": "username"
  });

  if (sinceId) {
    params.set("since_id", sinceId);
  }

  const res = await fetch(`${X_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`X ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as XSearchResponse;
  const users = new Map(
    (data.includes?.users ?? []).map((user) => [user.id, user.username ?? user.id])
  );

  const receivedAt = new Date().toISOString();

  return {
    newestId: data.meta?.newest_id,
    nextToken: data.meta?.next_token,
    resultCount: data.meta?.result_count ?? 0,
    events: (data.data ?? []).map((tweet) => {
      const authorId = tweet.author_id ?? "unknown";
      return {
        source: "x.recent_search",
        sourceEventKey: tweet.id,
        postId: tweet.id,
        authorId,
        authorUsername: users.get(authorId) ?? authorId,
        text: tweet.text,
        url: `https://x.com/i/web/status/${tweet.id}`,
        conversationId: tweet.conversation_id ?? tweet.id,
        matchedRuleTags: [matchedRuleTag],
        occurredAt: tweet.created_at ?? receivedAt,
        receivedAt,
        raw: tweet
      };
    })
  };
}
