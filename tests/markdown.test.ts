import { describe, expect, it } from "vitest";
import { convertMarkdownToConfluence } from "../src/markdown";

const MERMAID_KEY = "app/env/static/mermaid-diagram";
const diagram = "```mermaid\nsequenceDiagram\n  A->>B: hi\n```";

describe("fenced code blocks", () => {
  it("become code macros with the language, not <pre>", () => {
    const html = convertMarkdownToConfluence("```ts\nconst a = 1;\n```");
    expect(html).toContain('<ac:structured-macro ac:name="code"');
    expect(html).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>');
    expect(html).toContain("<![CDATA[const a = 1;]]>");
    expect(html).not.toContain("<pre>");
  });

  it("omit the language parameter for untagged fences", () => {
    const html = convertMarkdownToConfluence("```\nplain\n```");
    expect(html).not.toContain('ac:name="language"');
  });

  it("keep a literal ]]> from ending the CDATA section early", () => {
    const html = convertMarkdownToConfluence("```\na ]]> b\n```");
    expect(html).toContain("<![CDATA[a ]]]]><![CDATA[> b]]>");
  });

  it("strip characters that could break out of the language attribute", () => {
    const html = convertMarkdownToConfluence('```a"><b\ncode\n```');
    expect(html).not.toContain('"><b');
  });
});

describe("mermaid fences", () => {
  it("get the macro directly above the code block when a key is set", () => {
    const html = convertMarkdownToConfluence(diagram, { mermaidExtensionKey: MERMAID_KEY });
    expect(html.indexOf("<ac:adf-extension>")).toBeLessThan(html.indexOf('ac:name="code"'));
    expect(html).toContain(`<ac:adf-attribute key="extension-key">${MERMAID_KEY}</ac:adf-attribute>`);
    expect(html).toContain('<ac:parameter ac:name="language">mermaid</ac:parameter>');
  });

  it("use a distinct local id per diagram", () => {
    const html = convertMarkdownToConfluence(`${diagram}\n\n${diagram}`, {
      mermaidExtensionKey: MERMAID_KEY
    });
    const ids = [...html.matchAll(/key="local-id">([^<]+)</g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it("are plain code blocks when no key is configured", () => {
    const html = convertMarkdownToConfluence(diagram);
    expect(html).not.toContain("<ac:adf-extension>");
    expect(html).toContain('ac:name="code"');
  });
});
