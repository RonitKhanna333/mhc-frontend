import { NextRequest } from "next/server";
import { 
  BedrockAgentRuntimeClient, 
  InvokeAgentCommand 
} from "@aws-sdk/client-bedrock-agent-runtime";

export const runtime = "nodejs";

// Validate required environment variables
const requiredEnvVars = {
  BEDROCK_AGENT_ID: process.env.BEDROCK_AGENT_ID,
  BEDROCK_AGENT_ALIAS_ID: process.env.BEDROCK_AGENT_ALIAS_ID,
  BEDROCK_ACCESS_KEY_ID: process.env.BEDROCK_ACCESS_KEY_ID,
  BEDROCK_SECRET_ACCESS_KEY: process.env.BEDROCK_SECRET_ACCESS_KEY,
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}. ` +
    `Please configure these in Amplify environment variables.`
  );
}

// Bedrock Agent Configuration
const AGENT_CONFIG = {
  agentId: requiredEnvVars.BEDROCK_AGENT_ID!,
  agentAliasId: requiredEnvVars.BEDROCK_AGENT_ALIAS_ID!,
  region: process.env.BEDROCK_REGION || "us-east-1"
};

// Initialize Bedrock client
const bedrockClient = new BedrockAgentRuntimeClient({
  region: AGENT_CONFIG.region,
  credentials: {
    accessKeyId: requiredEnvVars.BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: requiredEnvVars.BEDROCK_SECRET_ACCESS_KEY!
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
    console.log("[Bedrock] Invoking agent with:", {
      agentId: AGENT_CONFIG.agentId?.substring(0, 10) + "...",
      agentAliasId: AGENT_CONFIG.agentAliasId?.substring(0, 10) + "...",
      sessionId,
      promptLength: prompt.length
    });

    const command = new InvokeAgentCommand({
      agentId: AGENT_CONFIG.agentId,
      agentAliasId: AGENT_CONFIG.agentAliasId,
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
    
    const body = (await request.json()) as IncomingBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conversationId = body.conversation_id ?? body.conversationId ?? `web_session_${Date.now()}`;

    const message = latestUserMessage(messages);
    if (!message) {
      console.warn("[API] No message provided");
      return new Response("Please provide a message", { status: 400 });
    }

    console.log("[API] Processing message:", {
      conversationId,
      messageLength: message.length,
      firstChars: message.substring(0, 50)
    });

    // Call Bedrock agent directly
    const responseText = await invokeBedrockAgent(message, conversationId);

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
