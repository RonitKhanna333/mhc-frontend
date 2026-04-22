import { NextRequest } from "next/server";
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from "@aws-sdk/client-bedrock-agent-runtime";
import { verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

// Build the Bedrock client on each request to pick up env vars lazily.
// On Amplify with an IAM execution role, credentials are omitted and the
// SDK default credential chain (IAM role / env vars) is used automatically.
// Explicit BEDROCK_ACCESS_KEY_ID / BEDROCK_SECRET_ACCESS_KEY are still
// supported as an override (e.g. local dev or cross-account scenarios).
function getBedrockClient(): BedrockAgentRuntimeClient {
  const region = process.env.BEDROCK_REGION || "us-east-1";
  const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    return new BedrockAgentRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // No explicit credentials → rely on Amplify IAM role / default chain
  return new BedrockAgentRuntimeClient({ region });
}

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

async function invokeBedrockAgent(prompt: string, sessionId: string): Promise<string> {
  const agentId = process.env.BEDROCK_AGENT_ID;
  const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    throw new Error(
      "Missing required environment variables: BEDROCK_AGENT_ID and/or BEDROCK_AGENT_ALIAS_ID. " +
      "Configure these in the Amplify Console under Environment Variables."
    );
  }

  try {
    console.log("[Bedrock] Invoking agent with:", {
      agentId: agentId.substring(0, 10) + "...",
      agentAliasId: agentAliasId.substring(0, 10) + "...",
      sessionId,
      promptLength: prompt.length
    });

    const bedrockClient = getBedrockClient();
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    });

    let completion = "";
    const response = await bedrockClient.send(command);

    console.log("[Bedrock] Response received, completion stream available:", !!response.completion);

    if (!response.completion) {
      throw new Error("No completion received from Bedrock agent");
    }

    // Handle streaming response
    for await (const chunkEvent of response.completion) {
      const chunk = chunkEvent.chunk;
      if (chunk?.bytes) {
        const decodedResponse = new TextDecoder("utf-8").decode(chunk.bytes);
        completion += decodedResponse;
      }
    }

    console.log("[Bedrock] Completion received, length:", completion.length);
    return completion.trim() || "I ran into an issue generating a response.";
  } catch (error: any) {
    console.error("[Bedrock] Agent Error:", {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });
    throw new Error(`Failed to invoke Bedrock agent: ${error.message}`);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    console.log("[API] Received chat request");

    // Verify Cognito token — returns the user's unique sub (userId)
    let userId: string;
    try {
      userId = await verifyToken(request.headers.get("authorization"));
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    // Combine userId + conversationId so each user gets isolated Bedrock sessions.
    // Sanitize to only chars allowed by Bedrock: [0-9a-zA-Z._:-]
    const rawConvId = body.conversation_id ?? body.conversationId ?? `ses-${Date.now().toString(36)}`;
    const safeConvId = rawConvId.replace(/[^0-9a-zA-Z._:-]/g, "-");
    const sessionId = `${userId}_${safeConvId}`.slice(0, 100);

    const message = latestUserMessage(messages);
    if (!message) {
      console.warn("[API] No message provided");
      return new Response("Please provide a message", { status: 400 });
    }

    console.log("[API] Processing message:", {
      userId: userId.substring(0, 8) + "...",
      sessionId,
      messageLength: message.length,
      firstChars: message.substring(0, 50)
    });

    // Call Bedrock agent — sessionId is per-user so Bedrock maintains
    // separate conversation memory for each authenticated user.
    const responseText = await invokeBedrockAgent(message, sessionId);

    console.log("[API] Response generated successfully, length:", responseText.length);

    return new Response(responseText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("[API] Route Error:", {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 3).join(" | ")
    });
    return new Response(`Chat service error: ${error.message}`, { status: 500 });
  }
}
