import { parseHTML } from "linkedom";

export type JuyaTocItem = {
  id: string;
  text: string;
  level: 2 | 3;
  /** Story number (`#n`) for level-3 entries. */
  n?: number;
  /** Stories under a level-2 section. */
  count?: number;
};

export type JuyaVideo = { platform: "youtube" | "bilibili"; url: string };

export type ShapedJuya = {
  html: string;
  /** The issue's own <h1> text, lifted out of the body. */
  heading: string | null;
  toc: JuyaTocItem[];
  cover: string | null;
  videos: JuyaVideo[];
  /** Numbered stories found; 0 means the issue kept its original layout. */
  count: number;
};

const STORY_NUMBER = /^#(\d{1,3})$/;
const SAFE_ID = /^[A-Za-z][\w-]{0,63}$/;

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isImageOnly(el: Element): boolean {
  return el.tagName === "P" && el.querySelector("img") !== null && textOf(el) === "";
}

function storyNumber(el: Element): { code: Element; n: number } | null {
  for (const code of Array.from(el.querySelectorAll("code"))) {
    const m = STORY_NUMBER.exec(textOf(code));
    if (m) return { code, n: Number(m[1]) };
  }
  return null;
}

export function hostLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function videoOf(href: string): JuyaVideo | null {
  const host = hostLabel(href);
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return { platform: "youtube", url: href };
  if (/(^|\.)bilibili\.com$|^b23\.tv$/.test(host)) return { platform: "bilibili", url: href };
  return null;
}

function slugHead(text: string, i: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `juya-${slug}` : `juya-h-${i}`;
}

/** Original layout: keep the HTML, give h2/h3 stable ids for the contents list. */
function decorateHeadings(html: string): { html: string; toc: JuyaTocItem[] } {
  const toc: JuyaTocItem[] = [];
  let i = 0;
  const next = html.replace(/<h([23])(\b[^>]*)>([\s\S]*?)<\/h\1>/gi, (_all, level, attrs, inner) => {
    i += 1;
    const text = String(inner).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const existing = /\bid=["']([^"']+)["']/i.exec(String(attrs));
    const id = existing?.[1] || slugHead(text, i);
    const lv = Number(level) === 3 ? 3 : 2;
    if (text) toc.push({ id, text, level: lv });
    const cleaned = String(attrs).replace(/\s*id=["'][^"']*["']/gi, "");
    return `<h${level} id="${id}"${cleaned}>${inner}</h${level}>`;
  });
  return { html: next, toc };
}

type Story = {
  section: Element;
  summary: Element | null;
  body: Element[];
  images: Element[];
  links: Element[];
  linksNext: boolean;
};

/**
 * Re-lay a sanitized Juya issue for reading in Hot AI.
 *
 * The feed body repeats what the page header already shows (cover, title,
 * video links, "view on the web" footer) and marks stories only with `#n`
 * code chips. This keeps every story's words but regroups them: the overview
 * becomes a numbered index whose lines jump to their stories, each story is a
 * section (number, linked title, summary, folded full text, image strip,
 * source hosts), and the contents list skips the overview's duplicate
 * category headings. Input must already be sanitized; anything that does not
 * look like a numbered issue keeps its original layout.
 */
export function shapeJuyaHtml(clean: string): ShapedJuya {
  const { document } = parseHTML(`<!doctype html><html><body>${clean}</body></html>`);
  let root: Element = document.body;
  // The feed wraps the issue in one styled <div>.
  while (root.children.length === 1 && root.firstElementChild?.tagName === "DIV") {
    root = root.firstElementChild;
  }
  const make = (tag: string, className?: string): Element => {
    const node = document.createElement(tag);
    if (className) node.setAttribute("class", className);
    return node;
  };
  const external = (a: Element) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  };

  // Masthead furniture before the first section.
  let cover: string | null = null;
  let heading: string | null = null;
  const videos: JuyaVideo[] = [];
  for (const node of Array.from(root.children)) {
    if (node.tagName === "H2") break;
    if (node.tagName === "H1") {
      heading ??= textOf(node) || null;
      node.remove();
    } else if (!cover && isImageOnly(node)) {
      cover = node.querySelector("img")?.getAttribute("src") ?? null;
      node.remove();
    } else if (/^视频版/.test(textOf(node))) {
      for (const a of Array.from(node.querySelectorAll("a[href]"))) {
        const video = videoOf(a.getAttribute("href") ?? "");
        if (video && !videos.some((v) => v.platform === video.platform)) videos.push(video);
      }
      node.remove();
    }
  }
  // Feed-only footer ("查看网页全文 · 查看 Markdown") and the rule above it.
  const tail = root.lastElementChild;
  if (tail && /查看网页全文|查看 ?Markdown/i.test(textOf(tail))) {
    tail.remove();
    if (root.lastElementChild?.tagName === "HR") root.lastElementChild.remove();
  }

  const kids = Array.from(root.children);
  const overviewAt = kids.findIndex((el) => el.tagName === "H2" && textOf(el) === "概览");
  let overviewEnd = overviewAt + 1;
  if (overviewAt >= 0) {
    while (overviewEnd < kids.length && !["HR", "H2"].includes(kids[overviewEnd]!.tagName)) overviewEnd += 1;
  } else {
    overviewEnd = 0;
  }

  let autoId = 0;
  const idFor = (el: Element): string => {
    const id = el.getAttribute("id");
    if (id && SAFE_ID.test(id)) return id;
    autoId += 1;
    const next = `juya-${autoId}`;
    el.setAttribute("id", next);
    return next;
  };

  const storyIds = new Map<number, string>();
  for (const el of kids.slice(overviewEnd)) {
    if (el.tagName !== "H3") continue;
    const num = storyNumber(el);
    if (num && !storyIds.has(num.n)) storyIds.set(num.n, idFor(el));
  }
  if (storyIds.size === 0) {
    const { html, toc } = decorateHeadings(root.innerHTML.trim());
    return { html, heading, toc, cover, videos, count: 0 };
  }

  const toc: JuyaTocItem[] = [];
  const out = make("div");
  const indexed = new Set<number>();

  for (const el of kids.slice(0, Math.max(overviewAt, 0))) out.append(el);

  if (overviewAt >= 0) {
    const overview = make("section", "kz-juya-overview");
    const head = kids[overviewAt]!;
    toc.push({ id: idFor(head), text: textOf(head), level: 2 });
    overview.append(head);
    let group: Element | null = null;
    for (const el of kids.slice(overviewAt + 1, overviewEnd)) {
      if (el.tagName === "H3") {
        group = make("div", "kz-juya-ov-group");
        el.removeAttribute("id");
        group.append(el);
        overview.append(group);
        continue;
      }
      if (el.tagName === "UL" || el.tagName === "OL") {
        el.setAttribute("class", "kz-juya-ov-list");
        for (const li of Array.from(el.children)) {
          const num = storyNumber(li);
          if (!num) continue;
          num.code.remove();
          const source = Array.from(li.querySelectorAll("a[href]")).find(
            (a) => !(a.getAttribute("href") ?? "").startsWith("#"),
          );
          source?.remove();
          const title = textOf(li).replace(/\s*↗$/, "");
          const target = storyIds.get(num.n);
          li.textContent = "";
          li.setAttribute("id", `juya-ov-${num.n}`);
          const link = make(target ? "a" : "span", "kz-juya-ov-link");
          if (target) link.setAttribute("href", `#${target}`);
          const badge = make("span", "kz-juya-n");
          badge.textContent = String(num.n);
          link.append(badge, document.createTextNode(title));
          li.append(link);
          if (source) {
            source.setAttribute("class", "kz-juya-ext");
            source.setAttribute("aria-label", `原文：${title}`);
            source.textContent = "↗";
            external(source);
            li.append(source);
          }
          indexed.add(num.n);
        }
      }
      (group ?? overview).append(el);
    }
    out.append(overview);
  }

  let container: Element = out;
  let sectionEntry: JuyaTocItem | null = null;
  const sectionHeads: Array<{ head: Element; entry: JuyaTocItem }> = [];
  let story: Story | null = null;
  let count = 0;

  const finish = () => {
    if (!story) return;
    const { section } = story;
    if (story.summary) {
      story.summary.setAttribute("class", "kz-juya-sum");
      section.append(story.summary);
    } else {
      section.append(...story.body);
    }
    // The "full text" toggle and the source hosts share one line.
    const foot = make("div", "kz-juya-foot");
    if (story.summary && story.body.length) {
      const more = make("details", "kz-juya-more");
      const label = make("summary");
      label.textContent = "全文";
      const full = make("div", "kz-juya-full");
      full.append(...story.body);
      more.append(label, full);
      foot.append(more);
    }
    const hosts = new Map<string, number>();
    const hrefs = new Set<string>();
    const sources = make("p", "kz-juya-src");
    for (const a of story.links) {
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || hrefs.has(href)) continue;
      hrefs.add(href);
      const host = hostLabel(href);
      const seen = (hosts.get(host) ?? 0) + 1;
      hosts.set(host, seen);
      const link = make("a");
      link.setAttribute("href", href);
      link.setAttribute("title", href);
      link.textContent = seen > 1 ? `${host} ${seen}` : host;
      external(link);
      sources.append(link);
    }
    if (sources.children.length) foot.append(sources);
    if (foot.children.length) section.append(foot);
    if (story.images.length) {
      const strip = make("div", "kz-juya-imgs");
      for (const img of story.images) {
        const src = img.getAttribute("src");
        if (!src) continue;
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
        img.setAttribute("alt", img.getAttribute("alt") ?? "");
        const link = make("a");
        link.setAttribute("href", src);
        external(link);
        link.append(img);
        strip.append(link);
      }
      if (strip.children.length) section.append(strip);
    }
    story = null;
  };

  for (const el of kids.slice(overviewEnd)) {
    const tag = el.tagName;
    if (tag === "HR") {
      finish();
      el.remove();
      continue;
    }
    if (tag === "H2") {
      finish();
      container = make("section", "kz-juya-cat");
      sectionEntry = { id: idFor(el), text: textOf(el), level: 2, count: 0 };
      toc.push(sectionEntry);
      sectionHeads.push({ head: el, entry: sectionEntry });
      container.append(el);
      out.append(container);
      continue;
    }
    const num = tag === "H3" ? storyNumber(el) : null;
    if (num) {
      finish();
      count += 1;
      if (sectionEntry) sectionEntry.count = (sectionEntry.count ?? 0) + 1;
      const id = idFor(el);
      num.code.remove();
      const title = textOf(el);
      for (const a of Array.from(el.querySelectorAll("a[href]"))) {
        a.setAttribute("class", "kz-juya-title");
        external(a);
      }
      const badge = make(indexed.has(num.n) ? "a" : "span", "kz-juya-n");
      if (indexed.has(num.n)) {
        badge.setAttribute("href", `#juya-ov-${num.n}`);
        badge.setAttribute("title", "回到概览");
      }
      badge.textContent = String(num.n);
      el.prepend(badge);
      const section = make("section", "kz-juya-item");
      section.setAttribute("aria-labelledby", id);
      section.append(el);
      container.append(section);
      toc.push({ id, text: title, level: 3, n: num.n });
      story = { section, summary: null, body: [], images: [], links: [], linksNext: false };
      continue;
    }
    if (!story) {
      if (/^提示[:：]/.test(textOf(el))) {
        el.setAttribute("class", "kz-juya-note");
        out.append(el);
      } else {
        container.append(el);
      }
      continue;
    }
    if (tag === "BLOCKQUOTE" && !story.summary && story.body.length === 0) {
      story.summary = el;
    } else if (isImageOnly(el)) {
      story.images.push(...Array.from(el.querySelectorAll("img")));
    } else if (tag === "P" && /^相关链接[:：]?$/.test(textOf(el))) {
      story.linksNext = true;
    } else if (story.linksNext && (tag === "UL" || tag === "OL")) {
      story.links.push(...Array.from(el.querySelectorAll("a[href]")));
      story.linksNext = false;
    } else {
      story.body.push(el);
    }
  }
  finish();
  for (const { head, entry } of sectionHeads) {
    if (!entry.count) continue;
    const badge = make("span", "kz-juya-cat-count");
    badge.textContent = String(entry.count);
    head.append(badge);
  }

  return { html: out.innerHTML.trim(), heading, toc, cover, videos, count };
}
