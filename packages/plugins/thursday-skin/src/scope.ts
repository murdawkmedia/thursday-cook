/**
 * WHERE THE SKIN APPLIES, AND WHY THE SELECTOR LOOKS LIKE THAT.
 *
 * The ticket asks the skin to override dsh's own theme variables "from a
 * higher-specificity root selector ... rather than forking the theme package".
 * Getting that right requires knowing where dsh declares them, which is not
 * where the phrase "root selector" suggests.
 *
 * dsh's `@deepseek-ai/dsh-client-ui-theme` ships two token layers and it puts
 * BOTH ON `body`, not on `:root`:
 *
 *   body                      { --dsw-static-*: ...; --dsw-alias-*: ...; }
 *   body[data-ds-dark-theme]  { --dsw-static-*: ...; --dsw-alias-*: ...; }
 *
 * That single fact rules out the obvious selector. Custom properties inherit,
 * so declaring `--dsw-alias-bg-base` on `html:root` would reach `body` only as
 * an INHERITED value, and an element's own declaration always beats a value it
 * inherited -- no matter how specific the ancestor's selector was. `html:root`
 * is the right tool for a plugin declaring its OWN variables (thursday-fonts
 * uses it for `--th-font-*`, correctly), and the wrong tool for overriding a
 * variable that the target element declares on itself.
 *
 * So the skin has to win on `body` itself:
 *
 *   body                             (0,0,1)
 *   body[data-ds-dark-theme]         (0,1,1)   <- what we must beat
 *   html:root body[data-thursday-skin] (0,2,2) <- what we use
 *
 * `html:root` contributes a second class-level unit and a second element-level
 * unit; `[data-thursday-skin]` contributes the other class-level unit. The
 * result outranks the dark-theme layer with room to spare, and it does so
 * without `!important`, so a component that legitimately rebinds a variable on
 * its own subtree (dsh's documented scrollbar rebinding contract does exactly
 * this) still wins locally, as it should.
 *
 * The attribute is also the uninstall story. The plugin sets it on `body` when
 * it applies and removes it when its fiber is disposed, so every declaration in
 * this stylesheet stops matching the instant the plugin goes away, before the
 * style element is even detached. Nothing is left inline on any element to
 * clean up, and nothing has to be restored to a remembered previous value.
 */

/** The plugin's name, used for the style element's `data-plugin` marker. */
export const PLUGIN_NAME = "thursday-skin";

/** The attribute the plugin sets on `<body>` for the whole time it is loaded. */
export const SCOPE_ATTRIBUTE = "data-thursday-skin";

/**
 * The selector every declaration in this skin is scoped to.
 *
 * Specificity (0,2,2), which beats dsh's `body[data-ds-dark-theme]` at (0,1,1).
 * See the module comment for the derivation.
 */
export const SCOPE_SELECTOR = `html:root body[${SCOPE_ATTRIBUTE}]`;

/**
 * Selector for the document element while the skin is loaded.
 *
 * Used only for `color-scheme`, which has to sit on `html` for the UA to pick
 * it up. `:has()` keeps it tied to the same attribute as everything else, so
 * removing the attribute reverses this too -- no second thing to undo.
 */
export const ROOT_SELECTOR = `html:root:has(body[${SCOPE_ATTRIBUTE}])`;

/** Value of the style element's `data-plugin-css` attribute. */
export const STYLE_ID = "thursday-skin";

/** Prefix a bare selector with the skin's scope. */
export function scoped(selector: string): string {
  return `${SCOPE_SELECTOR} ${selector}`;
}

/** Prefix each of several bare selectors, one per line, for a rule head. */
export function scopedList(selectors: readonly string[]): string {
  return selectors.map(scoped).join(",\n");
}
