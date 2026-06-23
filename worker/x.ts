import type { Post } from "./brain";

const X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

interface RecentSearchResult {
  newestId?: string;
  posts: Post[];
}

interface XTweet {
  id: string;
  text: string;
  author_id?: string;
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
  };
}

export async function recentSearch(query: string, sinceId?: string): Promise<RecentSearchResult> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error("X_BEARER_TOKEN is required");
  }

  const params = new URLSearchParams({
    query,
    max_results: process.env.X_SEARCH_MAX_RESULTS ?? "10",
    "tweet.fields": "author_id",
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

  return {
    newestId: data.meta?.newest_id,
    posts: (data.data ?? []).map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      author: users.get(tweet.author_id ?? "") ?? tweet.author_id ?? "unknown",
      url: `https://x.com/i/web/status/${tweet.id}`
    }))
  };
}
