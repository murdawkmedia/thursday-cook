// CLIENT-half fixture for the module-loader facade. react is external (dsh
// injects a lowercase `react` global), the .css import becomes a string
// through the css-text plugin, and the local module is bundled in.
import styles from "./styles.css";
import { label } from "./bundled-dep.js";

export function Panel() {
  return <div className="thursday-fixture">{label()}</div>;
}

export const css: string = styles;
