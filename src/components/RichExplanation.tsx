import { Fragment, type ReactNode } from "react";

/**
 * Lightweight renderer for AI explanations.
 * Supports:
 *  - **bold** (Markdown double-asterisk)
 *  - Lines starting with "- " or "* " → bullet list
 *  - Lines ending with ":" treated as section headers (also when bolded)
 *  - Blank lines → paragraph spacing
 *
 * Intentionally tiny — no full Markdown library needed.
 */

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`t-${key++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>
      );
    }
    parts.push(
      <strong key={`b-${key++}`} className="font-semibold text-foreground">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return parts;
}

interface Props {
  text: string;
  className?: string;
}

export function RichExplanation({ text, className }: Props) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  type Block =
    | { kind: "heading"; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "para"; text: string }
    | { kind: "spacer" };

  const blocks: Block[] = [];
  let currentList: string[] | null = null;

  const flushList = () => {
    if (currentList && currentList.length) {
      blocks.push({ kind: "list", items: currentList });
    }
    currentList = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      blocks.push({ kind: "spacer" });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      currentList ??= [];
      currentList.push(bullet[1]);
      continue;
    }
    flushList();
    // Heading: line ending with ":" OR fully wrapped in **...**:
    const isBoldHeading = /^\*\*[^*]+:?\*\*:?\s*$/.test(line);
    const endsWithColon = line.endsWith(":");
    if (isBoldHeading || endsWithColon) {
      blocks.push({ kind: "heading", text: line.replace(/:$/, "") });
    } else {
      blocks.push({ kind: "para", text: line });
    }
  }
  flushList();

  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === "spacer") {
          return <div key={i} className="h-2" />;
        }
        if (b.kind === "heading") {
          return (
            <p
              key={i}
              className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary first:mt-0"
            >
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === "list") {
          return (
            <ul key={i} className="mt-1 space-y-1 pl-4">
              {b.items.map((it, j) => (
                <li
                  key={j}
                  className="relative text-sm leading-relaxed text-foreground before:absolute before:-left-3 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-primary"
                >
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={i}
            className="mt-1 text-sm leading-relaxed text-foreground first:mt-0"
          >
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
}
