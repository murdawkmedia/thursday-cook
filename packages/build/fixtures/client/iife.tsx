// CLIENT-half fixture for the IIFE shape: no npm dependencies, so it calls
// window.__ModuleLoader__.load itself and needs no facade.
declare const window: {
  __ModuleLoader__: { load(mod: { id: string; factory: (require: unknown) => unknown }): void };
};

window.__ModuleLoader__.load({
  id: "fixture-iife",
  factory: () => ({ ok: true }),
});
