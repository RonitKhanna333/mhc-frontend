import { NextRequest } from "next/server";

export const runtime = "nodejs";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

type IncomingMessage = {
  role?: string;
  content?: unknown;
};

type IncomingBody = {
  messages?: IncomingMessage[];
  conversation_id?: string;
  conversationId?: string;
};

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          const maybeText = (item as { text?: unknown }).text;
          return typeof maybeText === "string" ? maybeText : "";
        }

        return "";
      })
      .join(" ")
      .trim();
  }

  if (content && typeof content === "object" && "text" in content) {
    const maybeText = (content as { text?: unknown }).text;
    return typeof maybeText === "string" ? maybeText : "";
  }

  return "";
}

function latestUserMessage(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user") {
      const text = contentToText(message.content).trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

async function fetchFallbackResponse(message: string, conversationId: string): Promise<string> {
  const response = await fetch(`${BACKEND_API_URL}/mhc/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        user_message: message,
      },
      config: {
        configurable: {
          session_id: conversationId,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fallback request failed with status ${response.status}: ${errorText}`);
  }

  const payload = (await response.json()) as {
    output?: {
      final_response?: {
        response?: string;
      };
    };
  };

  return payload.output?.final_response?.response?.trim() || "I ran into an issue generating a response.";
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conversationId = body.conversation_id ?? body.conversationId ?? "web_session";

    const message = latestUserMessage(messages);
    if (!message) {
      return new Response("Please provide a message.", { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_API_URL}/mhc/stream_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          user_message: message,
        },
        config: {
          configurable: {
            session_id: conversationId,
          },
        },
      }),
      cache: "no-store",
    });

    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const fallbackText = await fetchFallbackResponse(message, conversationId);
    return new Response(fallbackText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(`Chat service error: ${message}`, { status: 500 });
  }
}
