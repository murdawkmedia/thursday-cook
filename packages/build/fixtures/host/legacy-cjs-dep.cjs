// A CommonJS dependency that reaches for a node builtin by BARE specifier.
// The `node:*` external pattern does not match "child_process", so esbuild
// inlines its __require shim for this call.
const cp = require("child_process");
module.exports.spawnName = function spawnName() {
  return typeof cp.spawn;
};
