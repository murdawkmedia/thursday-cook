// Stands in for an npm dependency: must end up INSIDE the bundle.
export function greeting(who: string): string {
  return `hello ${who}`;
}
