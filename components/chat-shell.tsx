"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useChat } from "ai/react";
import type { Message } from "ai";
import {
  CircleStop,
  HeartHandshake,
  LogOut,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, signOut } from "aws-amplify/auth";

import MessageBubble from "@/components/message-bubble";

type HealthState = "checking" | "online" | "offline";

type HealthPayload = {
  status?: string;
  detail?: string;
};

const STARTER_PROMPTS = [
  "I have been feeling anxious at work lately.",
  "Can you help me reset after a hard day?",
  "I keep overthinking and cannot sleep.",
  "I feel emotionally exhausted and need support.",
];

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant" as const,
  content:
    "I am here to support you. Share what is weighing on you, and we can work through one calm step at a time.",
};

function createConversationId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `session_${Date.now().toString(36)}_${random}`;
}

function getStorageKey(userId: string): string {
  return `mhc_conv_id_${userId}`;
}

function getMessagesKey(userId: string): string {
  return `mhc_messages_${userId}`;
}

function getOrCreateConversationId(userId: string): string {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) return stored;
    const fresh = createConversationId();
    localStorage.setItem(getStorageKey(userId), fresh);
    return fresh;
  } catch {
    return createConversationId();
  }
}

function loadMessages(userId: string): typeof WELCOME_MESSAGE[] {
  try {
    const raw = localStorage.getItem(getMessagesKey(userId));
    if (!raw) return [WELCOME_MESSAGE];
    const parsed = JSON.parse(raw) as typeof WELCOME_MESSAGE[];
    return parsed.length > 0 ? parsed : [WELCOME_MESSAGE];
  } catch {
    return [WELCOME_MESSAGE];
  }
}

function saveMessages(userId: string, messages: typeof WELCOME_MESSAGE[]) {
  try {
    localStorage.setItem(getMessagesKey(userId), JSON.stringify(messages));
  } catch { /* quota exceeded or SSR */ }
}

function toDisplayText(content: Message["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return (content as unknown[])
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          const maybeText = (part as { text?: unknown }).text;
          return typeof maybeText === "string" ? maybeText : "";
        }

        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}

function ChatShellContent({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [conversationId, setConversationId] = useState<string>(() => getOrCreateConversationId(userId));
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const [healthMessage, setHealthMessage] = useState<string>("Checking backend");

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    stop,
    setMessages,
    error,
  } = useChat({
    api: "/api/chat",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      conversation_id: conversationId,
    },
    streamProtocol: "text",
    initialMessages: loadMessages(userId),
  });

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(userId, messages as typeof WELCOME_MESSAGE[]);
    }
  }, [messages, userId]);

  useEffect(() => {
    let mounted = true;

    const pollHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = (await response.json()) as HealthPayload;

        if (!mounted) {
          return;
        }

        if (payload.status === "online") {
          setHealthState("online");
          setHealthMessage("Backend online");
        } else {
          setHealthState("offline");
          setHealthMessage(payload.detail ?? "Backend unavailable");
        }
      } catch {
        if (!mounted) {
          return;
        }

        setHealthState("offline");
        setHealthMessage("Backend unavailable");
      }
    };

    pollHealth();
    const interval = window.setInterval(pollHealth, 25000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const totalUserMessages = useMemo(
    () => messages.filter((message: Message) => message.role === "user").length,
    [messages],
  );

  const totalAssistantMessages = useMemo(
    () => messages.filter((message: Message) => message.role === "assistant").length,
    [messages],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!input.trim() || isLoading) {
      event.preventDefault();
      return;
    }

    handleSubmit(event);
  };

  const handleStarterPrompt = async (prompt: string) => {
    if (isLoading) {
      return;
    }

    await append({
      role: "user",
      content: prompt,
    });
  };

  const resetConversation = () => {
    const fresh = createConversationId();
    try {
      localStorage.setItem(getStorageKey(userId), fresh);
      localStorage.removeItem(getMessagesKey(userId));
    } catch { /* ignore */ }
    setConversationId(fresh);
    setMessages([WELCOME_MESSAGE]);
  };

  return (
    <div className="scene">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <div className="ambient ambient--three" />

      <div className="layout-grid">
        <aside className="panel control-panel">
          <div className="brand-block">
            <p className="brand-block__tag">Mental Wellness Workspace</p>
            <h1>Mind Harbor Companion</h1>
            <p>
              A private support space that helps users process emotions safely, reflect clearly, and keep moving
              forward.
            </p>
          </div>

          <div className="starter-block">
            <h2>
              <Sparkles size={16} />
              Conversation Starters
            </h2>
            <div className="starter-list">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void handleStarterPrompt(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="actions-row">
            <button type="button" className="secondary-button" onClick={resetConversation}>
              <RefreshCw size={16} />
              New Session
            </button>
            <button type="button" className="secondary-button" onClick={stop} disabled={!isLoading}>
              <CircleStop size={16} />
              Stop
            </button>
            <button type="button" className="secondary-button" onClick={() => void signOut()}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </aside>

        <section className="panel chat-panel">
          <header className="chat-panel__header">
            <div className="chat-panel__title">
              <HeartHandshake size={18} />
              <div>
                <h2>Support Conversation</h2>
                <p>Confidential guidance with empathetic, structured responses.</p>
              </div>
            </div>
            <div className={`health-pill health-pill--${healthState}`}>
              <ShieldCheck size={14} />
              <span>{healthState}</span>
            </div>
          </header>

          {error ? <div className="error-banner">{error.message}</div> : null}

          <div className="message-list">
            {messages.map((message) => (
              <MessageBubble key={message.id} role={message.role} content={toDisplayText(message.content)} />
            ))}

            {isLoading ? (
              <div className="typing-indicator" aria-live="polite" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="chat-input" className="composer__label">
              Share what you want support with
            </label>
            <textarea
              id="chat-input"
              name="message"
              value={input}
              onChange={handleInputChange}
              rows={3}
              placeholder="Type your message here..."
              disabled={isLoading}
            />

            <div className="composer__actions">
              <p>Responses may include safety-focused suggestions when needed.</p>
              <button type="submit" className="primary-button" disabled={isLoading || !input.trim()}>
                <SendHorizontal size={16} />
                {isLoading ? "Responding..." : "Send Message"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function AuthWrapper() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "authenticated") {
      fetchAuthSession()
        .then((session: Awaited<ReturnType<typeof fetchAuthSession>>) => {
          const token = session.tokens?.accessToken?.toString();
          const sub = session.tokens?.accessToken?.payload?.sub as string | undefined;
          if (token) setAccessToken(token);
          if (sub) setUserId(sub);
        })
        .catch(console.error);
    } else {
      setAccessToken(null);
      setUserId(null);
    }
  }, [authStatus]);

  if (authStatus !== "authenticated" || !accessToken || !userId) return null;
  return <ChatShellContent accessToken={accessToken} userId={userId} />;
}

export default function ChatShell() {
  return (
    <Authenticator>
      <AuthWrapper />
    </Authenticator>
  );
}
