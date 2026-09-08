// blog/server.mjs
//
// A small blog. No dependencies; needs only node.
// Run from the workspace root:
//
//   node blog/server.mjs
//
// Then open the printed address in a browser.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_TITLE, PORT } from "./config.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(ROOT, "posts");

// TODO (tour ticket T1): drafts need a page behind a login. The session
// helper is already vendored at ./vendor/session.mjs — use it, do not
// write session handling by hand.

function parsePost(filename, text) {
  const slug = basename(filename, ".md");
  const meta = { title: slug, date: "", draft: false };
  let body = text;
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) {
      for (const line of text.slice(3, end).split("\n")) {
        const i = line.indexOf(":");
        if (i === -1) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        if (key === "title" && value) meta.title = value;
        if (key === "date") meta.date = value;
        if (key === "draft" && value === "true") meta.draft = true;
      }
      body = text.slice(end + 3).trim();
    }
  }
  return { slug, ...meta, body };
}

async function loadPosts() {
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith(".md")).sort();
  const posts = [];
  for (const file of files) {
    posts.push(parsePost(file, await readFile(join(POSTS_DIR, file), "utf8")));
  }
  return posts;
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(src) {
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.join(" ")}</p>`);
      para = [];
    }
  };
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("## ")) {
      flush();
      out.push(`<h2>${escapeHtml(t.slice(3))}</h2>`);
    } else if (t.startsWith("# ")) {
      flush();
      out.push(`<h1>${escapeHtml(t.slice(2))}</h1>`);
    } else {
      para.push(escapeHtml(t));
    }
  }
  flush();
  return out.join("\n");
}

function page(title, inner) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)} — ${escapeHtml(SITE_TITLE)}</title>
<link rel="stylesheet" href="/style.css"></head>
<body><main>
<h1 class="site-title">${escapeHtml(SITE_TITLE)}</h1>
${inner}
</main></body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/style.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end(await readFile(join(ROOT, "style.css"), "utf8"));
      return;
    }
    const posts = await loadPosts();
    if (url.pathname === "/") {
      const visible = posts
        .filter((p) => p.status !== "draft")
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const items = visible
        .map((p) => `<li><a href="/post/${p.slug}">${escapeHtml(p.title)}</a> <span class="date">${escapeHtml(p.date)}</span></li>`)
        .join("\n");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page("Latest first", `<ul class="posts">\n${items}\n</ul>`));
      return;
    }
    const postMatch = url.pathname.match(/^\/post\/([a-z0-9-]+)$/);
    if (postMatch) {
      const post = posts.find((p) => p.slug === postMatch[1]);
      if (!post) {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end(page("Not found", "<p>No such post.</p>"));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(post.title, `<p class="date">${escapeHtml(post.date)}</p>\n${renderMarkdown(post.body)}`));
      return;
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(page("Not found", "<p>No such page.</p>"));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Blog running at http://localhost:${PORT}/`);
});
