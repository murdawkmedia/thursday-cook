// blog/config.mjs
//
// The three values the tour edits. No install step reads them;
// the server reads them on startup, so restart it after changing them.

export const SITE_TITLE = "A Thursday Blog";
export const PORT = 8123;

// Local demo only. This password protects nothing but your own drafts
// page on your own machine. It is not real security.
export const EDIT_PASSWORD = "thursday-demo";
