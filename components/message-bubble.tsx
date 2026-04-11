import clsx from "clsx";

type MessageBubbleProps = {
  role: string;
  content: string;
};

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <article className={clsx("message-bubble", isUser ? "message-bubble--user" : "message-bubble--assistant")}>
      <p className="message-bubble__label">{isUser ? "You" : "Support AI"}</p>
      <div className="message-bubble__content">
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <p key={`${line}-${index}`}>
              {line}
            </p>
          ))
        ) : (
          <p>{content}</p>
        )}
      </div>
    </article>
  );
}
