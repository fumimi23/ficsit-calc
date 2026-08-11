#!/usr/bin/env python3
"""セッション開始時に「次に着手する issue」を 1 件決める(1 issue = 1 セッション運用)。

  手動: python3 scripts/next-issue.py

選択規則(このスクリプトが正本。CLAUDE.md「セッションの儀式」から参照される):
  1. in-progress ラベルの issue があればそれを再開する(前セッションの中断の痕跡)
  2. open のうち、本文の「Blocked by #N」の依存先が全て closed のものに絞る
  3. P0 > P1 > P2 > 優先度ラベル無し → 同率は番号の小さい順

出力: 「<番号>(タブ)<resume|start>(タブ)<タイトル>」を 1 行。
exit code: 0 = 選択できた / 1 = 着手できる issue が無い / 2 = 実行環境の問題
"""
import json
import re
import shutil
import subprocess
import sys

PRIO = {"P0": 0, "P1": 1, "P2": 2}


def labels(issue):
    return {l["name"] for l in (issue.get("labels") or [])}


def prio(issue):
    return min((PRIO[l] for l in labels(issue) if l in PRIO), default=3)


def deps(issue):
    body = issue.get("body") or ""
    return {int(n) for n in re.findall(r"blocked by #(\d+)", body, re.IGNORECASE)}


def main():
    if not shutil.which("gh"):
        print("gh が必要です", file=sys.stderr)
        return 2
    proc = subprocess.run(
        ["gh", "issue", "list", "--state", "open", "--limit", "200",
         "--json", "number,title,labels,body"],
        stdout=subprocess.PIPE, text=True,
    )
    if proc.returncode != 0:
        return 2  # gh のエラーは gh 自身が stderr に出している
    issues = json.loads(proc.stdout)

    wip = sorted((i for i in issues if "in-progress" in labels(i)),
                 key=lambda i: i["number"])
    if len(wip) > 1:
        print(f"注意: in-progress の issue が {len(wip)} 件あります(規約上は最大 1 件)。"
              "番号最小を選びます。", file=sys.stderr)
    if wip:
        print(f"{wip[0]['number']}\tresume\t{wip[0]['title']}")
        return 0

    open_nums = {i["number"] for i in issues}
    ready = sorted(
        (i for i in issues if not deps(i) & open_nums),
        key=lambda i: (prio(i), i["number"]),
    )
    if not ready:
        print("着手できる issue がありません(open が無いか、全て blocked)。",
              file=sys.stderr)
        return 1
    print(f"{ready[0]['number']}\tstart\t{ready[0]['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
