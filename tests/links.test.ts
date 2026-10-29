import { describe, expect, it } from "vitest";
import { rewriteLinks } from "../src/links";

const PAGES: Record<string, string> = {
  "Note B": "https://c.example/wiki/pages/viewpage.action?pageId=2",
  "folder/Note C.md": "https://c.example/wiki/pages/viewpage.action?pageId=3"
};

function makeResolver() {
  const calls: string[] = [];
  const resolve = async (target: string) => {
    calls.push(target);
    return PAGES[target] ?? null;
  };
  return { calls, resolve };
}

describe("rewriteLinks", () => {
  it("points wiki links at the Confluence page, keeping alias labels", async () => {
    const { resolve } = makeResolver();
    const out = await rewriteLinks("See [[Note B]] and [[Note B|the plan]].", resolve);
    expect(out).toBe(
      "See [Note B](https://c.example/wiki/pages/viewpage.action?pageId=2) and [the plan](https://c.example/wiki/pages/viewpage.action?pageId=2)."
    );
  });

  it("links the page for heading and block references", async () => {
    const { resolve } = makeResolver();
    const out = await rewriteLinks("[[Note B#Part|Part]] [[Note B^blk|blk]]", resolve);
    expect(out.match(/pageId=2\)/g)).toHaveLength(2);
    expect(out).not.toContain("#Part");
  });

  it("rewrites relative Markdown links to notes and drops the anchor", async () => {
    const { resolve } = makeResolver();
    const out = await rewriteLinks("[Go](folder/Note%20C.md#intro)", resolve);
    expect(out).toBe("[Go](https://c.example/wiki/pages/viewpage.action?pageId=3)");
  });

  it("leaves unresolved notes, external links, anchors, non-note files and embeds alone", async () => {
    const { resolve } = makeResolver();
    const input = [
      "[[Missing]]",
      "[x](Missing.md)",
      "[web](https://example.com/a.md)",
      "[top](#heading)",
      "[src](../repo/file.ts)",
      "![[Note B]]",
      "![img](Note B.md)"
    ].join("\n");
    expect(await rewriteLinks(input, resolve)).toBe(input);
  });

  it("does not touch links inside fenced or inline code", async () => {
    const { resolve, calls } = makeResolver();
    const input = "`[[Note B]]`\n\n```md\n[[Note B]] [a](folder/Note C.md)\n```\n\n~~~\n[[Note B]]\n~~~";
    expect(await rewriteLinks(input, resolve)).toBe(input);
    expect(calls).toEqual([]);
  });

  it("rewrites links next to code on the same line", async () => {
    const { resolve } = makeResolver();
    const out = await rewriteLinks("`[[Note B]]` then [[Note B]]", resolve);
    expect(out).toBe(
      "`[[Note B]]` then [Note B](https://c.example/wiki/pages/viewpage.action?pageId=2)"
    );
  });

  it("resolves each target once", async () => {
    const { resolve, calls } = makeResolver();
    await rewriteLinks("[[Note B]] [[Note B]] [[Note B|x]]", resolve);
    expect(calls).toEqual(["Note B"]);
  });
});

describe("rewriteLinks destinations", () => {
  it("handles angle-bracket destinations containing spaces and parentheses", async () => {
    const out = await rewriteLinks("[a](<folder/Note C.md>) [b](<folder/Note C.md> \"title\")", async (t) =>
      t === "folder/Note C.md" ? "https://c.example/p/3" : null
    );
    expect(out).toBe("[a](https://c.example/p/3) [b](https://c.example/p/3)");
  });
});
