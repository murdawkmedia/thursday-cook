// blog/vendor/session.mjs
//
// Vendored session helper for the tour. It stands in for an established
// session library: this workspace ships offline, so no package can be
// installed here. In real work, use the established library for the stack
// in front of you. Here, use this file; do not reimplement it.
import { randomBytes } from "node:crypto";

const COOKIE = "thursday_session";

export function readSessionId(req) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === COOKIE) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

export function createSessionStore() {
  const sessions = new Set();
  return {
    start(res) {
      const id = randomBytes(16).toString("hex");
      sessions.add(id);
      res.setHeader("Set-Cookie", `${COOKIE}=${id}; HttpOnly; Path=/`);
    },
    has(req) {
      const id = readSessionId(req);
      return id !== null && sessions.has(id);
    },
    end(req, res) {
      const id = readSessionId(req);
      if (id !== null) sessions.delete(id);
      res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
    },
  };
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(new URLSearchParams(data)));
    req.on("error", reject);
  });
}
