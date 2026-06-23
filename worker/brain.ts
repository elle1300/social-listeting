const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

const POSITIONING = `
mailbox.bot is an API-native physical mail + package receiving service.
Two audiences:
 - Today/boring: people who want a virtual mailbox / real business address that
   actually scans mail and receives packages (CMRA in Lomita, CA).
 - Future/wedge: builders who want to give an AI agent a real physical address
   plus mail & package handling via API and MCP.
`.trim();

const REPLY_RULES = `
- Sound like a real person, not a brand. Keep it short. No marketing voice.
- Lead with help or empathy. Answer their actual question first.
- Do NOT include a link unless they explicitly asked where to find something.
  (A reply containing a URL also costs ~13x more to post -- keep links out by default.)
- Never hard-sell. If we are not clearly useful, score it low and suggest no reply.
- Never trash-talk a competitor.
`.trim();

export interface Lead {
  relevance: number;
  intent: number;
  category: string;
  reasoning: string;
  reply_draft: string;
  risk_flags: string[];
}

export interface Post {
  id: string;
  text: string;
  author: string;
  url: string;
}

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

function messages(post: Post, matchedQuery: string): OpenRouterMessage[] {
  const system = [
    "You triage X (Twitter) posts for mailbox.bot and draft replies.",
    POSITIONING,
    "Score how good a lead this author is, then draft a reply.",
    "relevance = how on-topic to our space. intent = how actively they are looking / in pain.",
    "Reply rules:",
    REPLY_RULES,
    "Return ONLY a JSON object -- no prose, no code fences -- with keys:",
    "relevance (int 0-100), intent (int 0-100), category (string),",
    "reasoning (one sentence), reply_draft (string), risk_flags (string array)."
  ].join("\n");

  const user = `Matched query: ${matchedQuery}\nAuthor: @${post.author}\nPost: ${post.text}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

export function parseResult(raw: string): Lead {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed: unknown = JSON.parse(cleaned);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("model output is not an object");
  }

  const o = parsed as Record<string, unknown>;
  if (typeof o.relevance !== "number" || typeof o.intent !== "number") {
    throw new Error("scores missing or not numbers");
  }
  if (typeof o.reply_draft !== "string" || !Array.isArray(o.risk_flags)) {
    throw new Error("reply_draft or risk_flags malformed");
  }

  return {
    relevance: o.relevance,
    intent: o.intent,
    category: String(o.category ?? ""),
    reasoning: String(o.reasoning ?? ""),
    reply_draft: o.reply_draft,
    risk_flags: o.risk_flags.map(String)
  };
}

export async function scoreAndDraft(post: Post, matchedQuery: string): Promise<Lead> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: messages(post, matchedQuery)
    })
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const data: unknown = await res.json();
  const content = (
    data as { choices?: Array<{ message?: { content?: string } }> }
  ).choices?.[0]?.message?.content;

  return parseResult(content ?? "");
}

function selfCheck(): void {
  const good = `\`\`\`json
{"relevance":88,"intent":80,"category":"frustrated_switcher",
 "reasoning":"Their current mail service loses mail and they're asking for alternatives.",
 "reply_draft":"Losing mail is the worst. What kind of volume are you dealing with?",
 "risk_flags":[]}
\`\`\``;
  const result = parseResult(good);
  console.assert(result.relevance === 88 && result.intent === 80, "score parse");
  console.assert(result.reply_draft.length > 0, "reply present");
  console.assert(Array.isArray(result.risk_flags), "flags is array");

  let threw = false;
  try {
    parseResult('{"relevance":"high"}');
  } catch {
    threw = true;
  }
  console.assert(threw, "malformed input must throw");

  console.log("brain.ts self-check passed");
}

if (typeof require !== "undefined" && require.main === module) {
  selfCheck();
}
