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
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) {
        const maybeText = (item as { text?: unknown }).text;
        return typeof maybeText === "string" ? maybeText : "";
      }
      return "";
    }).join(" ").trim();
  }
  if (content && typeof content === "object" && "text" in content) {
    const maybeText = (content as { text?: unknown }).text;
    return typeof maybeText === "string" ? maybeText : "";
  }
  return "";
}

function latestUserMessage(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      const text = contentToText(message.content).trim();
      if (text) return text;
    }
  }
  return "";
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conversationId = body.conversation_id ?? body.conversationId ?? "web_session";

    const message = latestUserMessage(messages);
    if (!message) {
      return new Response("Please provide a message", { status: 400 });
    }

    const baseUrl = BACKEND_API_URL.replace(/\/$/, "");
    const apiUrl = "${baseUrl}/chat";

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: message,
        conversation_id: conversationId,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Backend error:", errText);
      throw new Error("Backend returned ${upstream.status}");
    }

    const payload = await upstream.json();
    const responseText = payload.result || "I ran into an issue generating a response.";

    return new Response(responseText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("Chat API Route Error:", error.message);
    return new Response("Chat service error: ${error.message}", { status: 500 });
  }
}
