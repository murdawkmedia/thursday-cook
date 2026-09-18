#!/usr/bin/env python3
"""
Would AST editing be a win? Measured from real session logs.

THE UNIT IS A CLUSTER, NOT A CALL. Counting individual `edit` calls answers the
wrong question. ast_edit is a CODEMOD tool: one structural pattern rewritten
across every matching node. The thing it replaces is not "an edit" — it is a
BURST of hand-written edits making the same change in many places.

So this counts clusters: runs of edit/write calls that are close in time and
related by file or by shared content. For each cluster it asks the question
that decides the experiment:

  Did the edits in this cluster share a token?

A cluster of six edits that all contain the same identifier is a rename or a
signature change done by hand, six times. That is exactly one ast_edit. A
cluster of six edits sharing nothing is six different changes that happened to
be adjacent, and AST editing would not have helped.

Also counted, because they are the cost being paid today:
  - edit failures (pattern not found, pattern not unique) — a structural match
    cannot have these
  - how many files a cluster spans — cross-file clusters are the strongest
    codemod signal, since a single ast_edit covers a whole directory
  - file extensions — ast-grep parses languages. Markdown, YAML and JSON edits
    cannot move to it at all, and they cap the addressable share.

Counts only. Interpretation belongs in the report, not here.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

SESS = os.path.expanduser("~/.dsh/sessions")

# Two edits belong to the same cluster if they are within this many seconds of
# each other. Chosen to span a model's think-act-think loop without joining two
# unrelated pieces of work; reported so it can be argued with.
CLUSTER_GAP_S = 180

FAIL_NEEDLES = {
    "not_found": ["old_string not found", "did not appear", "no match for", "not found in", "does not contain"],
    "not_unique": ["appears 2", "appears 3", "appears multiple", "not unique", "more than once", "occurrences of"],
    "must_read_first": ["requires reading", "read the file first"],
}

CODE_EXT = {
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "c", "h",
    "cpp", "hpp", "rb", "php", "swift", "kt", "lua", "sh", "bash", "css", "scss",
}

# A "token" for relatedness: identifier-ish runs of >=4 chars. Short ones and
# pure keywords produce false relatedness, so they are dropped.
TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
STOPWORDS = {
    "const", "function", "return", "import", "export", "from", "this", "true",
    "false", "null", "undefined", "await", "async", "class", "type", "interface",
    "string", "number", "boolean", "void", "then", "catch", "throw", "else",
    "value", "props", "children", "default", "require", "module", "exports",
    "with", "that", "have", "would", "which", "when", "what", "into", "each",
}


def tokens(s):
    if not isinstance(s, str):
        return set()
    return {t for t in TOKEN_RE.findall(s) if t.lower() not in STOPWORDS}


def records(path):
    try:
        p = subprocess.run(["zstd", "-dcq", path], capture_output=True, timeout=180)
    except Exception:
        return
    for line in p.stdout.split(b"\n"):
        if not line.strip():
            continue
        try:
            yield json.loads(line)
        except Exception:
            continue


def ext_of(p):
    if not isinstance(p, str):
        return "?"
    base = p.rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[-1].lower() if "." in base else "(none)"


def main(limit=None):
    logs = []
    for root, _d, files in os.walk(SESS):
        for f in files:
            if f == "session.jsonl.zstd":
                logs.append(os.path.join(root, f))
    logs.sort()
    if limit:
        logs = logs[-limit:]  # newest paths sort last within a project

    total = Counter()
    ext_counter = Counter()
    fail_counter = Counter()
    cluster_sizes = Counter()
    related_sizes = Counter()
    cross_file = Counter()
    examples = []
    fail_samples = []
    bash_samples = []

    for lp in logs:
        total["sessions"] += 1
        edits = []          # (time_s, file, old_string)
        pending = {}
        for rec in records(lp):
            rtype = rec.get("type") or ""
            data = rec.get("data") or {}
            t = rec.get("time")
            ts = (t / 1000.0) if isinstance(t, (int, float)) and t > 1e11 else (t if isinstance(t, (int, float)) else 0)

            if rtype == "tool/call":
                name = data.get("name") or ""
                args = data.get("arguments") or data.get("args") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}
                if not isinstance(args, dict):
                    args = {}
                if name == "bash":
                    cmd = args.get("command") or ""
                    if isinstance(cmd, str) and cmd:
                        total["bash_calls"] += 1
                        # A bulk edit via shell: an interpreter plus an
                        # in-place write. Both halves are required — `python3
                        # -c "print(1)"` is not an edit, and `mv a b` is not a
                        # codemod.
                        interp = any(k in cmd for k in ("python3", "python ", "perl ", "awk ", "sed "))
                        writes = any(k in cmd for k in (
                            ".write_text(", ".write(", "sed -i", "perl -pi", "perl -i",
                            "> ", ">>", "writeFileSync", "tee ",
                        ))
                        replaces = any(k in cmd for k in (
                            ".replace(", "re.sub", "s/", "gsub", "str_replace",
                        ))
                        if interp and writes:
                            total["bash_bulk_edit"] += 1
                            if replaces:
                                total["bash_bulk_substitution"] += 1
                                if len(bash_samples) < 10:
                                    bash_samples.append(cmd[:200])
                            # how many distinct paths does the command name?
                            paths = set(re.findall(r"[\w./-]+\.[A-Za-z0-9]{1,5}", cmd))
                            if len(paths) > 1:
                                total["bash_bulk_multifile"] += 1

                if name in ("edit", "str_replace_editor", "write"):
                    fp = args.get("file_path") or args.get("path") or ""
                    total[f"call_{name}"] += 1
                    if name != "write":
                        ext_counter[ext_of(fp)] += 1
                        edits.append((ts, fp, args.get("old_string") or ""))
                        if args.get("replace_all") is True:
                            total["replace_all_true"] += 1
                    cid = data.get("callId") or data.get("id")
                    if cid:
                        pending[cid] = name

            if rtype == "tool/result":
                # The result nests: data.message.content[] holds tool-result
                # entries carrying isError and the text. callId links it back to
                # the call, so a failure is attributed to the tool that failed.
                msg = data.get("message") or {}
                for entry in (msg.get("content") or []):
                    if entry.get("type") != "tool-result":
                        continue
                    cid = entry.get("toolCallId")
                    if pending.get(cid) not in ("edit", "str_replace_editor"):
                        continue
                    total["edit_results"] += 1
                    if not entry.get("isError"):
                        continue
                    total["edit_failures"] += 1
                    txt = json.dumps(entry.get("content") or "").lower()
                    for label, needles in FAIL_NEEDLES.items():
                        if any(n in txt for n in needles):
                            fail_counter[label] += 1
                            break
                    else:
                        fail_counter["other"] += 1
                        if len(fail_samples) < 8:
                            fail_samples.append(txt[:180])

        # ---- cluster the edits of this session by time gap
        if not edits:
            continue
        edits.sort(key=lambda e: e[0])
        cluster = [edits[0]]
        clusters = []
        for e in edits[1:]:
            if e[0] and cluster[-1][0] and (e[0] - cluster[-1][0]) <= CLUSTER_GAP_S:
                cluster.append(e)
            else:
                clusters.append(cluster)
                cluster = [e]
        clusters.append(cluster)

        for c in clusters:
            n = len(c)
            cluster_sizes[min(n, 10)] += 1
            total["clusters"] += 1
            if n < 2:
                continue
            total["clusters_2plus"] += 1
            files = {f for _t, f, _o in c}
            if len(files) > 1:
                cross_file[min(len(files), 6)] += 1
                total["clusters_cross_file"] += 1
            # relatedness: a token present in at least half the edits
            counts = Counter()
            for _t, _f, old in c:
                for tok in tokens(old):
                    counts[tok] += 1
            shared = [tok for tok, k in counts.items() if k >= max(2, (n + 1) // 2)]
            if shared:
                total["clusters_related"] += 1
                related_sizes[min(n, 10)] += 1
                exts = {ext_of(f) for f in files}
                if exts & CODE_EXT:
                    total["clusters_related_code"] += 1
                    if len(examples) < 12 and n >= 3:
                        examples.append({
                            "session": os.path.basename(os.path.dirname(lp)),
                            "edits": n,
                            "files": len(files),
                            "exts": sorted(exts),
                            "shared_tokens": sorted(shared, key=lambda s: -counts[s])[:5],
                        })

    print(json.dumps({
        "cluster_gap_seconds": CLUSTER_GAP_S,
        "sessions": total["sessions"],
        "edit_calls": total["call_edit"],
        "bash_calls": total["bash_calls"],
        "bash_bulk_edit": total["bash_bulk_edit"],
        "bash_bulk_substitution": total["bash_bulk_substitution"],
        "bash_bulk_multifile": total["bash_bulk_multifile"],
        "bash_samples": bash_samples,
        "write_calls": total["call_write"],
        "edit_failures": total["edit_failures"],
        "edit_results_seen": total["edit_results"],
        "failure_kinds": fail_counter.most_common(),
        "failure_samples": fail_samples,
        "replace_all_true": total["replace_all_true"],
        "clusters_total": total["clusters"],
        "clusters_2plus": total["clusters_2plus"],
        "clusters_related": total["clusters_related"],
        "clusters_related_code": total["clusters_related_code"],
        "clusters_cross_file": total["clusters_cross_file"],
        "cluster_size_hist": sorted(cluster_sizes.items()),
        "related_cluster_size_hist": sorted(related_sizes.items()),
        "cross_file_hist": sorted(cross_file.items()),
        "edit_by_ext": ext_counter.most_common(14),
        "examples": examples,
    }, indent=2))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
