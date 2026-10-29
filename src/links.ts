export interface WikiLink {
  target: string;
  label: string;
  baseTarget: string;
}

export type ResolveLinkUrl = (target: string) => Promise<string | null>;

interface Segment {
  text: string;
  code: boolean;
}

const WIKI_LINK = /(!?)\[\[([^\]]+)\]\]/g;
const MARKDOWN_LINK = /(!?)\[([^\]]*)\]\((<[^>\n]*>(?:\s+"[^"]*")?|[^)]+)\)/g;
const INLINE_CODE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;

export function parseWikiLink(inner: string): WikiLink {
  const parts = inner.split("|");
  const rawTarget = (parts[0] || "").trim();
  const label = (parts[1] || rawTarget).trim();
  const baseTarget = rawTarget.split("#")[0].split("^")[0].trim();

  return {
    target: rawTarget,
    label: label || rawTarget,
    baseTarget
  };
}

// Returns the note path of a relative Markdown link to a note, or null for anything else.
function parseNoteLinkDestination(rawDestination: string): string | null {
  const trimmed = rawDestination.trim();
  const destination = trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.indexOf(">") === -1 ? undefined : trimmed.indexOf(">"))
    : trimmed.split(/\s+/)[0];
  if (!destination || destination.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith("//")) {
    return null;
  }

  const path = destination.split("#")[0].split("?")[0];
  if (!/\.md$/i.test(path)) {
    return null;
  }

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function splitOutsideCode(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let fenceMarker = "";

  markdown.split("\n").forEach((line, index, lines) => {
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence && !fenceMarker) {
      fenceMarker = fence[1];
      segments.push({ text: line, code: true });
    } else if (fence && fence[1] === fenceMarker) {
      fenceMarker = "";
      segments.push({ text: line, code: true });
    } else if (fenceMarker) {
      segments.push({ text: line, code: true });
    } else {
      let last = 0;
      for (const match of line.matchAll(INLINE_CODE)) {
        segments.push({ text: line.slice(last, match.index), code: false });
        segments.push({ text: match[0], code: true });
        last = match.index + match[0].length;
      }
      segments.push({ text: line.slice(last), code: false });
    }

    if (index < lines.length - 1) {
      segments.push({ text: "\n", code: true });
    }
  });

  return segments;
}

/**
 * Rewrites Obsidian links to published notes as plain Markdown links to their
 * Confluence URL. Wiki links and relative `.md` Markdown links are handled;
 * embeds, code, external links and unresolved targets are left untouched.
 */
export async function rewriteLinks(
  markdown: string,
  resolveUrl: ResolveLinkUrl
): Promise<string> {
  const segments = splitOutsideCode(markdown);

  const targets = new Set<string>();
  for (const segment of segments) {
    if (segment.code) {
      continue;
    }
    for (const match of segment.text.matchAll(WIKI_LINK)) {
      const { baseTarget } = parseWikiLink(match[2]);
      if (!match[1] && baseTarget) {
        targets.add(baseTarget);
      }
    }
    for (const match of segment.text.matchAll(MARKDOWN_LINK)) {
      const notePath = match[1] ? null : parseNoteLinkDestination(match[3]);
      if (notePath) {
        targets.add(notePath);
      }
    }
  }

  if (!targets.size) {
    return markdown;
  }

  const resolved = new Map<string, string | null>();
  await Promise.all(
    Array.from(targets).map(async (target) => {
      resolved.set(target, await resolveUrl(target));
    })
  );

  return segments
    .map((segment) => {
      if (segment.code) {
        return segment.text;
      }

      return segment.text
        .replace(WIKI_LINK, (full, embed, inner) => {
          const { label, baseTarget } = parseWikiLink(inner);
          const url = embed ? null : resolved.get(baseTarget);
          return url ? `[${label}](${url})` : full;
        })
        .replace(MARKDOWN_LINK, (full, embed, label, destination) => {
          const notePath = embed ? null : parseNoteLinkDestination(destination);
          const url = notePath ? resolved.get(notePath) : null;
          return url ? `[${label}](${url})` : full;
        });
    })
    .join("");
}
