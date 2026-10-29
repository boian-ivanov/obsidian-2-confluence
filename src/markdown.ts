import MarkdownIt from "markdown-it";

export interface MarkdownConvertOptions {
  convertWikiLinks: boolean;
  handleEmbedsAsText: boolean;
  mermaidExtensionKey: string;
}

const DEFAULT_OPTIONS: MarkdownConvertOptions = {
  convertWikiLinks: true,
  handleEmbedsAsText: true,
  mermaidExtensionKey: ""
};

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml"
};

function normalizeCodeLanguage(info: string): string {
  const language = info.trim().split(/\s+/)[0].toLowerCase();
  return CODE_LANGUAGE_ALIASES[language] || language;
}

// Confluence storage format ignores <pre><code>, so fences must be code macros.
function renderCodeMacro(code: string, language: string): string {
  const safeLanguage = language.replace(/[^a-z0-9#+-]/g, "");
  const languageParam = safeLanguage
    ? `<ac:parameter ac:name="language">${safeLanguage}</ac:parameter>`
    : "";
  const body = code.replace(/\]\]>/g, "]]]]><![CDATA[>");
  return (
    `<ac:structured-macro ac:name="code" ac:schema-version="1">` +
    `${languageParam}<ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body>` +
    `</ac:structured-macro>`
  );
}

// Marketplace Mermaid apps render the nearest mermaid code block on the page.
function renderMermaidMacro(extensionKey: string): string {
  const localId = globalThis.crypto.randomUUID();
  return (
    `<ac:adf-extension><ac:adf-node type="extension">` +
    `<ac:adf-attribute key="extension-key">${extensionKey}</ac:adf-attribute>` +
    `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>` +
    `<ac:adf-attribute key="parameters">` +
    `<ac:adf-parameter key="layout">extension</ac:adf-parameter>` +
    `<ac:adf-parameter key="guest-params" />` +
    `<ac:adf-parameter key="forge-environment">PRODUCTION</ac:adf-parameter>` +
    `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>` +
    `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${extensionKey}</ac:adf-parameter>` +
    `<ac:adf-parameter key="extension-title">Mermaid diagram</ac:adf-parameter>` +
    `</ac:adf-attribute>` +
    `<ac:adf-attribute key="text">Mermaid diagram</ac:adf-attribute>` +
    `<ac:adf-attribute key="layout">default</ac:adf-attribute>` +
    `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>` +
    `</ac:adf-node></ac:adf-extension>`
  );
}

export function convertMarkdownToConfluence(
  markdown: string,
  options?: Partial<MarkdownConvertOptions>
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let source = markdown;

  if (opts.handleEmbedsAsText) {
    source = source.replace(/!\[\[([^\]]+)\]\]/g, (_match, inner) => {
      const target = String(inner).split("|")[0].trim();
      return `Embedded content not synced: ${target}`;
    });
  }

  if (opts.convertWikiLinks) {
    source = source.replace(/\[\[([^\]]+)\]\]/g, (_match, inner) => {
      const parts = String(inner).split("|");
      const link = parts[0].trim();
      const label = (parts[1] || link).trim();
      return `[${label}](${link})`;
    });
  }

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false
  });

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const language = normalizeCodeLanguage(token.info);
    const code = renderCodeMacro(token.content.replace(/\n$/, ""), language);
    if (language === "mermaid" && opts.mermaidExtensionKey) {
      return renderMermaidMacro(opts.mermaidExtensionKey) + code;
    }
    return code;
  };

  return md.render(source);
}
