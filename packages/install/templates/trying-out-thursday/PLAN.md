# Thursday tour

Your first hour: a blog you make your own, and the workflow that runs it.

## Vision

The tour walks the full ticket lifecycle on work you asked for — sign off,
review evidence, verify, mark done — then shows the context tools on the
session that work produced, then turns something you did by hand into a
wizard you keep. You end holding a blog with your words on it.

## Critical context

- The blog runs with `node blog/server.mjs`. No install step, no network access, no credentials.
- Posts and styles reload in the browser on their own. The server itself loads once at startup: restart it after editing any `blog/*.mjs` file.
- The login password is in `blog/config.mjs`. It protects drafts on your own machine only.
- Each chapter ends at a stopping point. Chapter 2 and chapter 3 are optional.
- Everything here stays when you uninstall Thursday.

## Phase 1: Ticket lifecycle

- [ ] **Ticket T1: Add login to the blog.** Ask for it in your own words ("add login to my blog"). The agent searches the workspace for prior art, finds the vendored session helper, and wires a login page plus a drafts page behind it.

  **Evaluate:**

  - opening `/drafts` without logging in sends you to the login page
  - the wrong password shows a visible rejection on the login page
  - the password from `blog/config.mjs` reaches a drafts page listing draft posts
  - the evidence names the vendored helper and why it was reused rather than reimplemented

- [ ] **Ticket T2: Hide the draft post.** The post `draft-ideas` is marked as a draft and still appears on the public front page. Find why the filter misses it and fix it so drafts are private again.

  **Evaluate:**

  - the public front page lists only posts with `draft: false`
  - opening `/post/draft-ideas` without logging in returns not-found
  - the fix touches the listing logic, not the post file
  - the evidence quotes the old filter and the new one and states why the old one missed

- [ ] **Ticket T3: Make the blog yours.** Replace the placeholder posts with your own words, set the site title in `blog/config.mjs`, and restyle `blog/style.css`. One line of your own is enough if you have nothing prepared.

  **Evaluate:**

  - the front page shows a site title you chose
  - at least one post is your own words rather than the shipped placeholder
  - the stylesheet is visibly yours: colours or type differ from the shipped gray
  - every changed file still loads: the index returns 200 and each post page returns 200

## Phase 2: Context tools

- [ ] **Ticket T4: Shrink the session, then recover from it.** Run `/compact` on the session built by T1–T3. Then ask the agent about one specific detail from that work that the summary elided. The agent recovers it with `resume_search`.

  **Evaluate:**

  - the compacted session is visibly shorter than the full log
  - the agent answers the elided detail exactly, using `resume_search` rather than rereading the session
  - the evidence states the query it ran and where the answer was found

## Phase 3: The second time

- [ ] **Ticket T5: Build a wizard that publishes a post.** You added a post by hand in T3. Turn that into `wizards/new-post.mjs`: it asks for a title and writes the dated file with front matter filled in. Run it once and keep it.

  **Evaluate:**

  - the wizard exists at `wizards/new-post.mjs` and runs with `node wizards/new-post.mjs`
  - running it produces a new post file that appears on the blog index
  - refusing a duplicate title and an empty title are both handled with a message, not a crash
  - the evidence states which steps stay human (the title, the words) and which the wizard owns
