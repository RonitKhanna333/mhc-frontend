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
    }).catch((err) => {
      console.error("Fetch failed:", err.message);
      throw err;
    });

    if (upstream.ok && upstream.body) {
      // Parse SSE stream and extract response from mix processing
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              let buffer = "";
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines[lines.length - 1];
                
                for (let i = 0; i < lines.length - 1; i++) {
                  const line = lines[i].trim();
                  
                  if (line.startsWith("data: ")) {
                    try {
                      const jsonStr = line.slice(6);
                      const data = JSON.parse(jsonStr);
                      
                      // Extract response from mix processing final output
                      if (data.ops) {
                        for (const op of data.ops) {
                          if (op.path === "/logs/mix_processing/final_output" && op.value?.parallel_outputs?.mix?.response) {
                            const response = op.value.parallel_outputs.mix.response;
                            controller.enqueue(encoder.encode(response));
                            controller.close();
                            return;
                          }
                        }
                      }
                    } catch {
                      // Skip lines that aren't valid JSON
                    }
                  }
                }
              }
              
              // If we got here without finding a response, close the stream
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        }
      );
    }

    const fallbackText = await fetchFallbackResponse(message, conversationId);
    return new Response(fallbackText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unexpected error";
    const details = error instanceof Error ? error.stack : "";
    console.error("Chat API error:", errorMessage, details);
    return new Response(`Chat service error: ${errorMessage}. Backend URL: ${BACKEND_API_URL}`, { status: 500 });
  }
}
