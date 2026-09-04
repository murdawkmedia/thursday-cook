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

function start(): void {
  document.documentElement.setAttribute("data-js", "on");
  document.querySelectorAll("[data-tabs]").forEach(enhanceTabs);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
