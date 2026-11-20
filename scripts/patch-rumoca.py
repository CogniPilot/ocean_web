"""Apply the ordered Rumoca fixes to a pinned checkout, preserving its index."""

import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


def git(*args, data=None):
    return subprocess.run(
        ["git", *args], env=environment, input=data, check=True, stdout=subprocess.PIPE
    ).stdout


repo, revision, *patches = sys.argv[1:]
patches = [Path(patch).resolve() for patch in patches]
os.chdir(repo)
with tempfile.TemporaryDirectory() as scratch:
    environment = {**os.environ, "GIT_INDEX_FILE": str(Path(scratch) / "index")}
    git("read-tree", revision)
    trees = [git("write-tree").strip().decode()]
    for patch in patches:
        # Some historical patches include a fix later folded into a larger one.
        applied = subprocess.run(
            ["git", "apply", "--cached", "--reverse", "--check", str(patch)],
            env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if applied.returncode:
            git("apply", "--cached", str(patch))
        trees.append(git("write-tree").strip().decode())
    final = trees[-1]
    paths = git("diff", "--name-only", "-z", trees[0], final).split(b"\0")[:-1]

    # Two fixes can touch the same lines. Match each file against its exact
    # history, including checkouts where only part of a series was applied.
    histories = []
    for tree in trees:
        entries = git("ls-tree", "-rz", tree, "--", *paths).split(b"\0")[:-1]
        histories.append(dict(entry.split(b"\t", 1)[::-1] for entry in entries))
    pending = {}
    for path in paths:
        file = Path(os.fsdecode(path))
        current = None
        if file.exists() or file.is_symlink():
            mode = file.lstat().st_mode
            if not stat.S_ISREG(mode):
                sys.exit(f"Unexpected file type in Rumoca checkout: {file}")
            git_mode = b"100755" if mode & stat.S_IXUSR else b"100644"
            current = git_mode + b" blob " + git("hash-object", "--", path).strip()
        if current == histories[-1].get(path):
            continue
        index = next(
            (i for i in reversed(range(len(trees))) if current == histories[i].get(path)),
            None,
        )
        if index is None:
            sys.exit(f"Local edits in Rumoca file {file} differ from the pinned patch series")
        pending.setdefault(trees[index], []).append(path)

    patch = b"".join(
        git("diff", "--binary", tree, final, "--", *group)
        for tree, group in pending.items()
    )
    if patch:
        git("apply", "--check", "-", data=patch)
        git("apply", "-", data=patch)
