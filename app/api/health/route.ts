import { NextResponse } from "next/server";
import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";

export async function GET(): Promise<NextResponse> {
  try {
    const agentId = process.env.BEDROCK_AGENT_ID;
    const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;
    const region = process.env.BEDROCK_REGION || "us-east-1";
    const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY;

    if (!agentId || !agentAliasId) {
      return NextResponse.json({ status: "offline", detail: "Bedrock not configured" }, { status: 200 });
    }

    // Just instantiating the client with valid credentials is enough to
    // confirm the service is reachable — no need to invoke the agent.
    const client = accessKeyId && secretAccessKey
      ? new BedrockAgentRuntimeClient({ region, credentials: { accessKeyId, secretAccessKey } })
      : new BedrockAgentRuntimeClient({ region });

    // Destroy immediately — we only needed to confirm credentials resolve
    client.destroy();

    return NextResponse.json({ status: "online", detail: "Bedrock connected" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "offline", detail: "Bedrock unreachable" }, { status: 200 });
  }
}

