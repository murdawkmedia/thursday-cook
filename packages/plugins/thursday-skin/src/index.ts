/**
 * Host row for thursday-skin.
 *
 * It does nothing, and it has to exist. dsh's client-module registry only
 * discovers a package's `dsh.client` entry if the package mounts a row on the
 * host plane, so a client-only plugin still needs a host half whose entire job
 * is to be found. Without it the bundle is built, installed, and never loaded
 * -- which is exactly the state all four Thursday plugins were in until
 * 2026-09-09.
 *
 * The pattern is copied from dotfiles-ai's system-fonts, which is the smallest
 * working example of a client-only plugin in this stack.
 */
const name = "thursday-skin";

function apply(): void {}

export { apply, name };
