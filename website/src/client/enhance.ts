/**
 * The only script on the site.
 *
 * It adds keyboard behaviour that HTML has no element for -- a roving-tabindex
 * tabs group -- and nothing else. The markup it enhances is already correct
 * without it: every panel is rendered, the first is visible, and every tab is a
 * focusable button, so blocking this file degrades the page rather than
 * breaking it.
 */

interface TabsGroup {
  readonly tabs: HTMLElement[];
  readonly panels: HTMLElement[];
}

function readGroup(root: Element): TabsGroup | null {
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
  if (tabs.length === 0 || tabs.length !== panels.length) return null;
  return { tabs, panels };
}

function select(group: TabsGroup, index: number, moveFocus: boolean): void {
  group.tabs.forEach((tab, position) => {
    const active = position === index;
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
    if (active && moveFocus) tab.focus();
  });
  group.panels.forEach((panel, position) => {
    panel.hidden = position !== index;
  });
}

function enhanceTabs(root: Element): void {
  const group = readGroup(root);
  if (group === null) return;

  group.tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(group, index, false));
    tab.addEventListener("keydown", (event: KeyboardEvent) => {
      const last = group.tabs.length - 1;
      let next: number | null = null;
      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      if (next === null) return;
      event.preventDefault();
      // Automatic activation: the panels are cheap, so arrowing to a tab shows
      // it. That is the ARIA-recommended pattern when switching costs nothing.
      select(group, next, true);
    });
  });
}

/** How long a copy control stays in its "copied" state, in milliseconds. */
const COPIED_FOR = 2000;

/**
 * Copy-to-clipboard, attached only when the browser can honour it.
 *
 * THE DEGRADATION IS THE DEFAULT, NOT THE FALLBACK. The command is selectable
 * text in a `<pre>`; that is the whole feature with this file blocked. The
 * control is rendered with `hidden` set, so the only thing this function adds
 * is a shortcut -- and it adds it only after finding a real clipboard API,
 * which is missing outside a secure context. A button that cannot work must
 * never be offered, and must never be tabbable while invisible.
 */
function enhanceCopy(control: HTMLElement): void {
  const targetId = control.getAttribute("data-copy");
  if (targetId === null) return;
  const target = document.getElementById(targetId);
  if (target === null) return;

  // Widened on purpose: the DOM types declare `clipboard` as always present,
  // and it is the runtime that disagrees.
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (clipboard === undefined || typeof clipboard.writeText !== "function") return;

  const statusId = control.getAttribute("data-copy-status");
  const status = statusId === null ? null : document.getElementById(statusId);
  const doneLabel = control.getAttribute("data-copy-done") ?? "Copied";
  const idleLabel = (control.textContent ?? "").trim();
  let revert = 0;

  const announce = (message: string): void => {
    if (status !== null) status.textContent = message;
  };

  control.hidden = false;
  control.addEventListener("click", () => {
    const text = (target.textContent ?? "").trim();
    void clipboard.writeText(text).then(
      () => {
        control.textContent = doneLabel;
        announce(`${doneLabel}: ${text}`);
        window.clearTimeout(revert);
        revert = window.setTimeout(() => {
          control.textContent = idleLabel;
          announce("");
        }, COPIED_FOR);
      },
      () => {
        // A refused clipboard write is the browser's decision, not a fault to
        // shout about. The command is still there and still selectable.
        announce("Copying was blocked. Select the command and copy it.");
      },
    );
  });
}

function start(): void {
  document.documentElement.setAttribute("data-js", "on");
  document.querySelectorAll("[data-tabs]").forEach(enhanceTabs);
  document.querySelectorAll<HTMLElement>("[data-copy]").forEach(enhanceCopy);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
