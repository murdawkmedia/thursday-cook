// HOST-half fixture for the createRequire banner. `legacy-cjs-dep.cjs` calls
// require("child_process") with a bare specifier, exactly as cross-spawn does
// inside @modelcontextprotocol/sdk's stdio transport.
import { spawnName } from "./legacy-cjs-dep.cjs";

export default function apply(): string {
  return spawnName();
}
