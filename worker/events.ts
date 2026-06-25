import type { Post } from "./brain";

export type SocialEventSource = "x.recent_search" | "x.filtered_stream";

export interface SocialEvent {
  source: SocialEventSource;
  sourceEventKey: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  text: string;
  url: string;
  conversationId: string;
  matchedRuleTags: string[];
  occurredAt: string;
  receivedAt: string;
  raw: unknown;
}

export function socialEventToPost(event: SocialEvent): Post {
  return {
    id: event.postId,
    text: event.text,
    author: event.authorUsername || event.authorId || "unknown",
    url: event.url
  };
}
