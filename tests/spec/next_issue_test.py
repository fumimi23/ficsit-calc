"""scripts/next-issue.py の選択規則(純関数)の約束テスト。

gh 呼び出しは含まない。テストデータは gh の JSON 形状を模した dict で組み立てる。
"""
import importlib.util
import pathlib
import unittest

_path = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "next-issue.py"
_spec = importlib.util.spec_from_file_location("next_issue", _path)
next_issue = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(next_issue)


def issue(number, prio=None, milestone=None, labels=(), body="", title=None):
    """gh issue list --json number,title,labels,body,milestone の 1 件を模す。"""
    names = ([prio] if prio else []) + list(labels)
    return {
        "number": number,
        "title": title or f"issue {number}",
        "labels": [{"name": n} for n in names],
        "body": body,
        "milestone": (
            None if milestone is None
            else {"description": "", "dueOn": None,
                  "number": milestone[0], "title": milestone[1]}
        ),
    }


def milestone(number, title, state="open", open_issues=0, closed_issues=0):
    """gh api repos/.../milestones の 1 件を模す(REST の snake_case)。"""
    return {
        "number": number,
        "title": title,
        "state": state,
        "open_issues": open_issues,
        "closed_issues": closed_issues,
        "description": "",
        "due_on": None,
    }


class MilestoneTitleTest(unittest.TestCase):
    # issue #63: マイルストーン所属の判定に使う入口
    def test_マイルストーン未設定の_issue_は_None(self):
        self.assertIsNone(next_issue.milestone_title(issue(1)))

    def test_マイルストーン設定済みの_issue_はその_title(self):
        self.assertEqual(
            next_issue.milestone_title(issue(1, milestone=(2, "v0.2.0"))),
            "v0.2.0",
        )


class OldestOpenMilestoneTest(unittest.TestCase):
    # issue #63: 「最も古い open マイルストーン」= 残 open を持つ open のうち number 最小
    def test_open_のうち番号が最小のものを返す(self):
        ms = [milestone(3, "v0.3.0", open_issues=1),
              milestone(2, "v0.2.0", open_issues=1)]
        self.assertEqual(next_issue.oldest_open_milestone(ms), "v0.2.0")

    def test_closed_のマイルストーンは無視する(self):
        ms = [milestone(1, "v0.1.0", state="closed", open_issues=1),
              milestone(2, "v0.2.0", open_issues=1)]
        self.assertEqual(next_issue.oldest_open_milestone(ms), "v0.2.0")

    # issue #63: 残 0 のマイルストーンは close されるまで open のまま残るが、
    # 所属する open issue が無いので target にするとマイルストーン段が全 issue で効かなくなる
    def test_残_open_が_0_のマイルストーンは_target_にしない(self):
        ms = [milestone(1, "v0.1.0", open_issues=0),
              milestone(2, "v0.2.0", open_issues=3)]
        self.assertEqual(next_issue.oldest_open_milestone(ms), "v0.2.0")

    def test_着手先のある_open_マイルストーンが無ければ_None(self):
        self.assertIsNone(next_issue.oldest_open_milestone([]))
        self.assertIsNone(
            next_issue.oldest_open_milestone(
                [milestone(1, "v0.1.0", state="closed", open_issues=1)]
            )
        )


class ReleasableMilestonesTest(unittest.TestCase):
    # issue #63: open issue が 0 のマイルストーンがあるとき、出力にリリースを促す行が含まれる
    def test_残_open_が_0_の_open_マイルストーンだけを番号の昇順で返す(self):
        ms = [
            milestone(3, "v0.3.0", open_issues=0, closed_issues=2),
            milestone(2, "v0.2.0", open_issues=3, closed_issues=1),
            milestone(1, "v0.1.0", open_issues=0, closed_issues=5),
        ]
        self.assertEqual(
            next_issue.releasable_milestones(ms), ["v0.1.0", "v0.3.0"]
        )

    def test_closed_のマイルストーンは促さない(self):
        ms = [milestone(1, "v0.1.0", state="closed", open_issues=0, closed_issues=3)]
        self.assertEqual(next_issue.releasable_milestones(ms), [])

    # issue #63: issue を 1 件も紐付けていないマイルストーンも残 open は 0 になるが、
    # ここで促すと残件検査も 0 件で通り、中身の無い Release が切れてしまう
    def test_issue_を一度も紐付けていないマイルストーンは促さない(self):
        ms = [milestone(1, "v0.1.0", open_issues=0, closed_issues=0)]
        self.assertEqual(next_issue.releasable_milestones(ms), [])


class ReleaseNoticeTest(unittest.TestCase):
    # issue #63: 促し行はタグ名と実行すべきコマンドが分かること(文面の完全一致は固定しない)
    def test_促し行にタグ名と_release_sh_が含まれる(self):
        line = next_issue.release_notice("v0.1.0")
        self.assertIn("v0.1.0", line)
        self.assertIn("release.sh", line)


class PickMilestoneTest(unittest.TestCase):
    # issue #63: 最も古い open マイルストーンに属する issue は、同優先度のマイルストーン外より先に返る
    def test_同じ_P1_なら最古マイルストーン所属が番号の大きさに関わらず先に返る(self):
        issues = [
            issue(10, prio="P1"),
            issue(20, prio="P1", milestone=(1, "v0.1.0")),
        ]
        picked, mode = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 20)
        self.assertEqual(mode, "start")

    # issue #63: P0 はマイルストーン所属の P1 / P2 より先に返る
    def test_マイルストーン外の_P0_がマイルストーン所属の_P1_P2_より先に返る(self):
        issues = [
            issue(10, prio="P1", milestone=(1, "v0.1.0")),
            issue(11, prio="P2", milestone=(1, "v0.1.0")),
            issue(20, prio="P0"),
        ]
        picked, _ = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 20)

    # issue #63: マイルストーン段は P1 / P2 の話。P0 同士は所属で順番を変えない
    def test_P0_同士はマイルストーン所属に関わらず番号昇順(self):
        issues = [
            issue(20, prio="P0", milestone=(1, "v0.1.0")),
            issue(10, prio="P0"),
        ]
        picked, _ = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 10)

    # issue #63: 他マイルストーン所属は「マイルストーン無し」と同じ扱い(最古のものだけが優遇される)
    def test_最古でないマイルストーン所属は優遇されない(self):
        issues = [
            issue(10, prio="P1", milestone=(2, "v0.2.0")),
            issue(20, prio="P1", milestone=(1, "v0.1.0")),
        ]
        picked, _ = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 20)

    # issue #63: マイルストーン段を挟んでも P1 > P2 > 優先度無し → 同率は番号昇順は保つ
    def test_マイルストーン内では_P1_が_P2_より先で同率は番号昇順(self):
        issues = [
            issue(30, prio="P2", milestone=(1, "v0.1.0")),
            issue(20, prio="P1", milestone=(1, "v0.1.0")),
            issue(15, prio="P1", milestone=(1, "v0.1.0")),
        ]
        picked, _ = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 15)

    # issue #63: マイルストーンを使っていないリポジトリ(target が None)でも従来どおり動く
    def test_対象マイルストーンが無ければ優先度と番号だけで決まる(self):
        issues = [issue(20, prio="P1"), issue(10, prio="P2")]
        picked, _ = next_issue.pick(issues, None)
        self.assertEqual(picked["number"], 20)


class PickExistingRulesTest(unittest.TestCase):
    # issue #63: 純関数へ切り出すリファクタで壊れうる既存の約束を固定する
    def test_in_progress_があれば優先度より強く_resume_で返る(self):
        issues = [
            issue(10, prio="P0", milestone=(1, "v0.1.0")),
            issue(30, prio="P2", labels=["in-progress"]),
        ]
        picked, mode = next_issue.pick(issues, "v0.1.0")
        self.assertEqual(picked["number"], 30)
        self.assertEqual(mode, "resume")

    def test_in_progress_が複数あれば番号最小を_resume_で返す(self):
        issues = [
            issue(30, labels=["in-progress"]),
            issue(12, labels=["in-progress"]),
        ]
        picked, mode = next_issue.pick(issues, None)
        self.assertEqual(picked["number"], 12)
        self.assertEqual(mode, "resume")

    def test_依存先が_open_の_issue_は候補から外れる(self):
        issues = [
            issue(10, prio="P0", body="Blocked by #20"),
            issue(20, prio="P2"),
        ]
        picked, _ = next_issue.pick(issues, None)
        self.assertEqual(picked["number"], 20)

    def test_依存先が_closed_なら候補に戻る(self):
        issues = [issue(10, prio="P0", body="Blocked by #99")]
        picked, mode = next_issue.pick(issues, None)
        self.assertEqual(picked["number"], 10)
        self.assertEqual(mode, "start")

    def test_候補が無ければ_None(self):
        self.assertIsNone(next_issue.pick([], None))
        blocked = [
            issue(10, body="Blocked by #20"),
            issue(20, body="Blocked by #10"),
        ]
        self.assertIsNone(next_issue.pick(blocked, "v0.1.0"))


if __name__ == "__main__":
    unittest.main()
