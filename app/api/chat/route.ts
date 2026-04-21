import { NextRequest } from "next/server";
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from "@aws-sdk/client-bedrock-agent-runtime";

export const runtime = "nodejs";

// Bedrock Agent Configuration
const AGENT_CONFIG = {
  agentId: process.env.BEDROCK_AGENT_ID!,
  agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID!,
  region: process.env.AWS_REGION || "us-east-1"
};

// Initialize Bedrock client
const bedrockClient = new BedrockAgentRuntimeClient({
  region: AGENT_CONFIG.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

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
  try {
    const command = new InvokeAgentCommand({
      agentId: AGENT_CONFIG.agentId,
      agentAliasId: AGENT_CONFIG.agentAliasId,
      sessionId,
      inputText: prompt,
    });

    let completion = "";
    const response = await bedrockClient.send(command);

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

    return completion.trim() || "I ran into an issue generating a response.";
  } catch (error: any) {
    console.error("Bedrock Agent Error:", error);
    throw new Error(`Failed to invoke Bedrock agent: ${error.message}`);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conversationId = body.conversation_id ?? body.conversationId ?? `web_session_${Date.now()}`;

    const message = latestUserMessage(messages);
    if (!message) {
      return new Response("Please provide a message", { status: 400 });
    }

    // Call Bedrock agent directly
    const responseText = await invokeBedrockAgent(message, conversationId);

    return new Response(responseText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("Chat API Route Error:", error.message);
    return new Response(`Chat service error: ${error.message}`, { status: 500 });
  }
}
