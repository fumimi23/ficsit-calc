#!/usr/bin/env python3
"""セッション開始時に「次に着手する issue」を 1 件決める(1 issue = 1 セッション運用)。

  手動: python3 scripts/next-issue.py

選択規則(このスクリプトが正本。CLAUDE.md「セッションの儀式」から参照される):
  1. in-progress ラベルの issue があればそれを再開する(前セッションの中断の痕跡)
  2. open のうち、本文の「Blocked by #N」の依存先が全て closed のものに絞る
  3. P0
  4. 最も古い open マイルストーンに属する issue(P1 > P2 > 優先度ラベル無し)
  5. マイルストーン無し / それ以外のマイルストーン(P1 > P2 > 優先度ラベル無し)
  6. 同率は番号の小さい順

出力: 残 open が 0 の open マイルストーンごとにリリースを促す行(0 行以上)を先に出し、
      続けて「<番号>(タブ)<resume|start>(タブ)<タイトル>」を 1 行。
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


def milestone_title(issue):
    milestone = issue.get("milestone")
    return milestone["title"] if milestone else None


def oldest_open_milestone(milestones):
    # マイルストーン番号は作成順に振られるので、番号最小 = 最も古い。
    # due_on や created_at は未設定があり得るため使わない。
    opened = [m for m in milestones if m.get("state") == "open"]
    if not opened:
        return None
    return min(opened, key=lambda m: m["number"])["title"]


def releasable_milestones(milestones):
    ready = [m for m in milestones
             if m.get("state") == "open" and m.get("open_issues") == 0]
    return [m["title"] for m in sorted(ready, key=lambda m: m["number"])]


def sort_key(issue, target_milestone):
    p = prio(issue)
    in_target = (target_milestone is not None
                 and milestone_title(issue) == target_milestone)
    # P0 はマイルストーンより強い(版の都合で最優先を待たせない)。
    return (0 if p == 0 else 1, 0 if in_target else 1, p, issue["number"])


def pick(issues, target_milestone):
    wip = sorted((i for i in issues if "in-progress" in labels(i)),
                 key=lambda i: i["number"])
    if wip:
        return (wip[0], "resume")

    open_nums = {i["number"] for i in issues}
    ready = sorted(
        (i for i in issues if not deps(i) & open_nums),
        key=lambda i: sort_key(i, target_milestone),
    )
    if not ready:
        return None
    return (ready[0], "start")


def release_notice(title):
    return (f"リリース可能: マイルストーン {title} の open issue が 0 件です。"
            f"`sh scripts/release.sh {title}` を実行してください。")


def main():
    if not shutil.which("gh"):
        print("gh が必要です", file=sys.stderr)
        return 2
    proc = subprocess.run(
        ["gh", "issue", "list", "--state", "open", "--limit", "200",
         "--json", "number,title,labels,body,milestone"],
        stdout=subprocess.PIPE, text=True,
    )
    if proc.returncode != 0:
        return 2  # gh のエラーは gh 自身が stderr に出している
    issues = json.loads(proc.stdout)

    # 残 open が 0 のマイルストーンは open issue 側から見えない(所属 issue が一覧に出ない)。
    milestones_proc = subprocess.run(
        ["gh", "api", "repos/{owner}/{repo}/milestones?state=open&per_page=100"],
        stdout=subprocess.PIPE, text=True,
    )
    if milestones_proc.returncode != 0:
        return 2
    milestones = json.loads(milestones_proc.stdout)

    for title in releasable_milestones(milestones):
        print(release_notice(title))

    wip = [i for i in issues if "in-progress" in labels(i)]
    if len(wip) > 1:
        print(f"注意: in-progress の issue が {len(wip)} 件あります(規約上は最大 1 件)。"
              "番号最小を選びます。", file=sys.stderr)

    chosen = pick(issues, oldest_open_milestone(milestones))
    if chosen is None:
        print("着手できる issue がありません(open が無いか、全て blocked)。",
              file=sys.stderr)
        return 1
    issue, mode = chosen
    print(f"{issue['number']}\t{mode}\t{issue['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
