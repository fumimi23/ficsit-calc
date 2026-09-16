// issue #62 invariants: Pages へ公開する前のゲート(scripts/check.sh)が外れていないことを固定する。
// workflow 自体は vitest で実行できないので、台帳に載せられるのは deploy.yml の静的検査だけ。
// 固定するのは「artifact を上げる job で check.sh が走る」+「deploy job がその job を needs する」の 2 点。
// 片方だけだと、無関係な job に check.sh を置いてゲートを迂回できてしまう。
// action のバージョン・step 名・job 名は偶然の挙動なので固定しない(job は使っている action から特定する)。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const WORKFLOW_PATH = path.join(REPO_ROOT, ".github/workflows/deploy.yml");

const ARTIFACT_ACTION = "actions/upload-pages-artifact";

const DEPLOY_ACTION = "actions/deploy-pages";

const GATE_SCRIPT = "scripts/check.sh";

type Job = { name: string; body: string };

/** コメントアウトされた step でゲートを満たしたことにしないため、走査前に落とす */
function stripComments(yaml: string): string {
	return yaml
		.split("\n")
		.map((line) => (/^\s*#/.test(line) ? "" : line))
		.join("\n");
}

/** `jobs:` 配下をインデント 2 のキーで job ごとのブロックに切る */
function splitJobs(yaml: string): Job[] {
	const lines = stripComments(yaml).split("\n");
	const starts: { name: string; line: number }[] = [];
	let inJobs = false;
	let jobsEnd = lines.length;
	for (const [index, line] of lines.entries()) {
		if (inJobs && /^\S/.test(line)) {
			inJobs = false;
			jobsEnd = index;
		}
		if (/^jobs:\s*$/.test(line)) {
			inJobs = true;
			jobsEnd = lines.length;
			continue;
		}
		if (!inJobs) {
			continue;
		}
		const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
		if (key !== null) {
			starts.push({ name: key[1], line: index });
		}
	}
	return starts.map((start, index) => {
		const next = starts[index + 1];
		const end = next === undefined ? jobsEnd : next.line;
		return {
			name: start.name,
			body: lines.slice(start.line + 1, end).join("\n"),
		};
	});
}

/** job が使っている action をバージョン抜きで列挙する */
function actionsUsedBy(job: Job): string[] {
	return job.body.split("\n").flatMap((line) => {
		const used = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
		return used === null ? [] : [used[1].split("@")[0]];
	});
}

function jobUsing(jobs: Job[], action: string): Job | undefined {
	return jobs.find((job) => actionsUsedBy(job).includes(action));
}

/** step の `name:` に書いただけの見せかけをゲートとみなさない */
function runsGateScript(job: Job): boolean {
	return job.body
		.split("\n")
		.some(
			(line) => !/^\s*(?:-\s+)?name:/.test(line) && line.includes(GATE_SCRIPT),
		);
}

function needsOf(job: Job): string[] {
	const lines = job.body.split("\n");
	const index = lines.findIndex((line) => /^ {4}needs:/.test(line));
	if (index === -1) {
		return [];
	}
	const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");
	const inline = (/^ {4}needs:(.*)$/.exec(lines[index])?.[1] ?? "").trim();
	if (inline !== "") {
		return inline
			.replace(/^\[/, "")
			.replace(/\]$/, "")
			.split(",")
			.map(unquote)
			.filter((value) => value !== "");
	}
	const items: string[] = [];
	for (const line of lines.slice(index + 1)) {
		const item = /^\s+-\s*(\S+)\s*$/.exec(line);
		if (item === null) {
			break;
		}
		items.push(unquote(item[1]));
	}
	return items;
}

function collectGateFailures(yaml: string): string[] {
	const jobs = splitJobs(yaml);
	const artifactJob = jobUsing(jobs, ARTIFACT_ACTION);
	const deployJob = jobUsing(jobs, DEPLOY_ACTION);
	const failures: string[] = [];
	if (artifactJob === undefined) {
		failures.push(`${ARTIFACT_ACTION} を使う job が無い`);
	} else if (!runsGateScript(artifactJob)) {
		failures.push(
			`${GATE_SCRIPT} を実行する step が job "${artifactJob.name}" に無い`,
		);
	}
	if (deployJob === undefined) {
		failures.push(`${DEPLOY_ACTION} を使う job が無い`);
	} else if (
		artifactJob !== undefined &&
		!needsOf(deployJob).includes(artifactJob.name)
	) {
		failures.push(
			`job "${deployJob.name}" の needs に "${artifactJob.name}" が無い`,
		);
	}
	return failures;
}

describe("invariants: Pages デプロイのゲート", () => {
	it("deploy.yml が check.sh を通してからデプロイする", () => {
		expect(existsSync(WORKFLOW_PATH)).toBe(true);

		const failures = collectGateFailures(readFileSync(WORKFLOW_PATH, "utf8"));

		expect(failures, `ゲートの欠落:\n${failures.join("\n")}`).toEqual([]);
	});

	it("ゲートを外した workflow を検出できる", () => {
		const jobs = (gateStep: string, needs: string) =>
			[
				"jobs:",
				"  build:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/checkout@v7",
				gateStep,
				"      - uses: actions/upload-pages-artifact@v5",
				"        with:",
				"          path: ./dist",
				"  deploy:",
				needs,
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/deploy-pages@v5",
				"",
			].join("\n");

		expect(
			collectGateFailures(
				jobs("      - run: sh scripts/check.sh", "    needs: build"),
			),
		).toEqual([]);
		expect(
			collectGateFailures(
				jobs("      - run: sh scripts/check.sh", "    needs: [build]"),
			),
		).toEqual([]);

		expect(
			collectGateFailures(
				jobs("      - run: npm run build", "    needs: build"),
			),
		).toEqual(['scripts/check.sh を実行する step が job "build" に無い']);

		expect(
			collectGateFailures(
				jobs("      # - run: sh scripts/check.sh", "    needs: build"),
			),
		).toEqual(['scripts/check.sh を実行する step が job "build" に無い']);

		expect(
			collectGateFailures(
				jobs("      - name: sh scripts/check.sh", "    needs: build"),
			),
		).toEqual(['scripts/check.sh を実行する step が job "build" に無い']);

		expect(
			collectGateFailures(
				jobs("      - run: sh scripts/check.sh", "    if: always()"),
			),
		).toEqual(['job "deploy" の needs に "build" が無い']);

		// ゲートを迂回する形(無関係な job に check.sh がある)も検出する
		const bypass = [
			"jobs:",
			"  lint:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - run: sh scripts/check.sh",
			"  build:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/upload-pages-artifact@v5",
			"  deploy:",
			"    needs: build",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/deploy-pages@v5",
			"",
		].join("\n");
		expect(collectGateFailures(bypass)).toEqual([
			'scripts/check.sh を実行する step が job "build" に無い',
		]);
	});
});
