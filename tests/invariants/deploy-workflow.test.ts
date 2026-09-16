// issue #62 invariants: Pages へ公開する前のゲート(scripts/check.sh)が外れていないことを固定する。
// workflow 自体は vitest で実行できないので、台帳に載せられるのは deploy.yml の静的検査だけ。
// 「check.sh の step がある」だけでは足りない。continue-on-error / if / `|| true` / 行末コメント /
// ゲートを通らない 2 本目の job を足すと、step を残したまま公開だけを素通りさせられる。
// そのため「ゲートが実際に効く形か」まで見る。
// job は使っている action から特定するので、公式 Pages Action(upload-pages-artifact / deploy-pages)で
// 公開すること自体もここで固定していることになる。別方式へ移すときはこの台帳ごと書き換える。
// 固定しないもの: action のバージョン・step 名・job 名・Node のバージョン・concurrency の値・
// step の並び順・npm ci / npm run build の有無。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const WORKFLOW_PATH = path.join(REPO_ROOT, ".github/workflows/deploy.yml");

const ARTIFACT_ACTION = "actions/upload-pages-artifact";

const DEPLOY_ACTION = "actions/deploy-pages";

const GATE_SCRIPT = "scripts/check.sh";

// `sh scripts/check.sh || true` や `echo 'scripts/check.sh'` をゲートとみなさないため、
// run の値そのものが check.sh の呼び出しであることを要求する
const GATE_COMMAND = /^(?:sh|bash)\s+(?:\.\/)?scripts\/check\.sh$/;

// 失敗しても後続を止めない / そもそも実行しない、を作れるキー
const DISABLING_KEYS = ["continue-on-error", "if"];

type Job = { name: string; body: string };

type Step = { keys: string[]; commands: string[] };

function indentOf(line: string): number {
	return line.length - line.trimStart().length;
}

/** コメントアウトされた step でゲートを満たしたことにしないため、走査前に落とす */
function stripComments(yaml: string): string {
	return yaml
		.split("\n")
		.map((line) => (/^\s*#/.test(line) ? "" : line))
		.join("\n");
}

function stripInlineComment(value: string): string {
	return value.replace(/\s+#.*$/, "").trim();
}

function unquote(value: string): string {
	return value.trim().replace(/^["']|["']$/g, "");
}

/** `key: v` / `key: [a, b]` / `key:` + `- a` の 3 形式から値の並びを取り出す */
function sequenceValue(lines: string[], keyPattern: RegExp): string[] {
	const index = lines.findIndex((line) => keyPattern.test(line));
	if (index === -1) {
		return [];
	}
	const inline = stripInlineComment(keyPattern.exec(lines[index])?.[1] ?? "");
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

/** インデント 0 のキーの直下ブロックを返す */
function topLevelBlock(yaml: string, keyPattern: RegExp): string[] {
	const lines = stripComments(yaml).split("\n");
	const index = lines.findIndex((line) => keyPattern.test(line));
	if (index === -1) {
		return [];
	}
	const block: string[] = [];
	for (const line of lines.slice(index + 1)) {
		if (line.trim() === "") {
			continue;
		}
		if (indentOf(line) === 0) {
			break;
		}
		block.push(line);
	}
	return block;
}

function pushBranches(yaml: string): string[] {
	const onBlock = topLevelBlock(yaml, /^on:\s*$/);
	const pushIndex = onBlock.findIndex((line) => /^ {2}push:\s*$/.test(line));
	if (pushIndex === -1) {
		return [];
	}
	const pushBlock: string[] = [];
	for (const line of onBlock.slice(pushIndex + 1)) {
		if (indentOf(line) <= 2) {
			break;
		}
		pushBlock.push(line);
	}
	return sequenceValue(pushBlock, /^ {4}branches:(.*)$/);
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
		return {
			name: start.name,
			body: lines
				.slice(start.line + 1, next === undefined ? jobsEnd : next.line)
				.join("\n"),
		};
	});
}

function jobLevelKeys(job: Job): string[] {
	return job.body.split("\n").flatMap((line) => {
		const key = /^ {4}([A-Za-z0-9_-]+):/.exec(line);
		return key === null ? [] : [key[1]];
	});
}

function needsOf(job: Job): string[] {
	return sequenceValue(job.body.split("\n"), /^ {4}needs:(.*)$/);
}

/** job が使っている action をバージョン抜きで列挙する */
function actionsUsedBy(job: Job): string[] {
	return job.body.split("\n").flatMap((line) => {
		const used = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
		return used === null ? [] : [used[1].split("@")[0]];
	});
}

function jobsUsing(jobs: Job[], action: string): Job[] {
	return jobs.filter((job) => actionsUsedBy(job).includes(action));
}

function stepBlocks(job: Job): string[] {
	const lines = job.body.split("\n");
	const stepsIndex = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
	if (stepsIndex === -1) {
		return [];
	}
	const blocks: string[][] = [];
	let markerIndent = -1;
	for (const line of lines.slice(stepsIndex + 1)) {
		if (line.trim() === "") {
			continue;
		}
		const indent = indentOf(line);
		if (
			/^\s*-\s/.test(line) &&
			(markerIndent === -1 || indent === markerIndent)
		) {
			markerIndent = indent;
			blocks.push([line]);
			continue;
		}
		if (markerIndent !== -1 && indent > markerIndent) {
			blocks[blocks.length - 1].push(line);
			continue;
		}
		break;
	}
	return blocks.map((block) => block.join("\n"));
}

/** run の値を取り出す。ブロックスカラー(`run: |`)は行ごとに分けて返す */
function runCommands(lines: string[], keyColumn: number): string[] {
	const index = lines.findIndex(
		(line, position) =>
			(position === 0 || indentOf(line) === keyColumn) &&
			/^run:/.test(line.slice(keyColumn)),
	);
	if (index === -1) {
		return [];
	}
	const inline = stripInlineComment(
		lines[index].slice(keyColumn).replace(/^run:/, ""),
	);
	if (inline !== "" && !/^[|>]/.test(inline)) {
		return [inline];
	}
	const commands: string[] = [];
	for (const line of lines.slice(index + 1)) {
		if (line.trim() === "") {
			continue;
		}
		if (indentOf(line) <= keyColumn) {
			break;
		}
		commands.push(stripInlineComment(line.trim()));
	}
	return commands;
}

function parseStep(block: string): Step {
	const lines = block.split("\n");
	const keyColumn = lines[0].length - lines[0].replace(/^\s*-\s+/, "").length;
	const keys = lines.flatMap((line, position) => {
		if (position !== 0 && indentOf(line) !== keyColumn) {
			return [];
		}
		const key = /^([A-Za-z0-9_-]+):/.exec(line.slice(keyColumn));
		return key === null ? [] : [key[1]];
	});
	return { keys, commands: runCommands(lines, keyColumn) };
}

function collectGateFailures(yaml: string): string[] {
	const failures: string[] = [];
	if (!pushBranches(yaml).includes("main")) {
		failures.push("on.push.branches に main が無い");
	}
	const jobs = splitJobs(yaml);
	const artifactJobs = jobsUsing(jobs, ARTIFACT_ACTION);
	const deployJobs = jobsUsing(jobs, DEPLOY_ACTION);
	// 2 本目があると、ゲートを通らない経路から公開できてしまう
	if (artifactJobs.length !== 1) {
		failures.push(
			`${ARTIFACT_ACTION} を使う job が ${artifactJobs.length} 個(1 個であること)`,
		);
	}
	if (deployJobs.length !== 1) {
		failures.push(
			`${DEPLOY_ACTION} を使う job が ${deployJobs.length} 個(1 個であること)`,
		);
	}
	if (artifactJobs.length !== 1 || deployJobs.length !== 1) {
		return failures;
	}
	const artifactJob = artifactJobs[0];
	const deployJob = deployJobs[0];
	for (const job of [artifactJob, deployJob]) {
		for (const key of jobLevelKeys(job)) {
			if (DISABLING_KEYS.includes(key)) {
				failures.push(`job "${job.name}" に job レベルの ${key} がある`);
			}
		}
	}
	const gateSteps = stepBlocks(artifactJob)
		.map(parseStep)
		.filter((step) =>
			step.commands.some((command) => GATE_COMMAND.test(command)),
		);
	if (gateSteps.length === 0) {
		failures.push(
			`job "${artifactJob.name}" に ${GATE_SCRIPT} を実行する step が無い`,
		);
	}
	for (const step of gateSteps) {
		for (const key of step.keys) {
			if (DISABLING_KEYS.includes(key)) {
				failures.push(
					`job "${artifactJob.name}" のゲート step に ${key} がある`,
				);
			}
		}
	}
	if (!needsOf(deployJob).includes(artifactJob.name)) {
		failures.push(
			`job "${deployJob.name}" の needs に "${artifactJob.name}" が無い`,
		);
	}
	return failures;
}

const VALID_WORKFLOW = [
	"on:",
	"  push:",
	"    branches: [main]",
	"  workflow_dispatch:",
	"",
	"jobs:",
	"  build:",
	"    runs-on: ubuntu-latest",
	"    steps:",
	"      - uses: actions/checkout@v7",
	"      - run: npm ci",
	"      - run: sh scripts/check.sh",
	"      - uses: actions/upload-pages-artifact@v5",
	"        with:",
	"          path: ./dist",
	"  deploy:",
	"    needs: build",
	"    runs-on: ubuntu-latest",
	"    steps:",
	"      - uses: actions/deploy-pages@v5",
	"",
].join("\n");

const GATE_STEP = "      - run: sh scripts/check.sh";

function appendJob(yaml: string, lines: string[]): string {
	return yaml + lines.join("\n");
}

// 検査が「ゲートの実効性」を見ていることを示す回帰ケース。
// 期待値は失敗メッセージの文言ではなく、原因になった YAML のキー / action 名で照合する
// (人間向けの文言を直しただけで落ちないようにするため)。
const BYPASSES: [string, string, RegExp][] = [
	[
		"A: ゲート step の continue-on-error",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			`${GATE_STEP}\n        continue-on-error: true`,
		),
		/continue-on-error/,
	],
	[
		"B: || true でゲートの失敗を握りつぶす",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: sh scripts/check.sh || true",
		),
		/scripts\/check\.sh/,
	],
	[
		"C: ゲート step の if: false",
		VALID_WORKFLOW.replace(GATE_STEP, `${GATE_STEP}\n        if: false`),
		/\bif\b/,
	],
	[
		"D: deploy job の if: always()",
		VALID_WORKFLOW.replace(
			"    needs: build",
			"    needs: build\n    if: always()",
		),
		/\bif\b/,
	],
	[
		"E: 行末コメントでゲートを装う",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: npm run test # sh scripts/check.sh は流さない",
		),
		/scripts\/check\.sh/,
	],
	[
		"F: echo でゲートを装う",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: echo 'scripts/check.sh は別途'",
		),
		/scripts\/check\.sh/,
	],
	[
		"G: artifact job の continue-on-error",
		VALID_WORKFLOW.replace(
			"  build:\n    runs-on: ubuntu-latest",
			"  build:\n    continue-on-error: true\n    runs-on: ubuntu-latest",
		),
		/continue-on-error/,
	],
	[
		"H: env の値でゲートを装う",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: npm run test\n        env:\n          SKIPPED_GATE: scripts/check.sh",
		),
		/scripts\/check\.sh/,
	],
	[
		"M: ゲートを通らない 2 本目の deploy job",
		appendJob(VALID_WORKFLOW, [
			"  deploy-hotfix:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/deploy-pages@v5",
			"",
		]),
		/actions\/deploy-pages/,
	],
	[
		"N: ゲートを通らない 2 本目の artifact job",
		appendJob(
			VALID_WORKFLOW.replace(
				"    needs: build",
				"    needs: [build, build-fast]",
			),
			[
				"  build-fast:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/upload-pages-artifact@v5",
				"",
			],
		),
		/actions\/upload-pages-artifact/,
	],
	[
		"トリガーを main 以外に変える",
		VALID_WORKFLOW.replace("    branches: [main]", "    branches: [preview]"),
		/on\.push\.branches/,
	],
	[
		"ゲート step を消す",
		VALID_WORKFLOW.replace(`${GATE_STEP}\n`, ""),
		/scripts\/check\.sh/,
	],
	[
		"ゲート step をコメントアウトする",
		VALID_WORKFLOW.replace(GATE_STEP, `      # ${GATE_STEP.trim()}`),
		/scripts\/check\.sh/,
	],
	[
		"step の name にだけ書く",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - name: sh scripts/check.sh\n        run: npm run test",
		),
		/scripts\/check\.sh/,
	],
	[
		"deploy job の needs を外す",
		VALID_WORKFLOW.replace("    needs: build\n", ""),
		/needs/,
	],
];

describe("invariants: Pages デプロイのゲート", () => {
	it("deploy.yml が check.sh を通してからデプロイする", () => {
		expect(existsSync(WORKFLOW_PATH)).toBe(true);

		const failures = collectGateFailures(readFileSync(WORKFLOW_PATH, "utf8"));

		expect(failures, `ゲートの欠落:\n${failures.join("\n")}`).toEqual([]);
	});

	it("ゲートを無効化する書き換えを検出できる", () => {
		expect(collectGateFailures(VALID_WORKFLOW)).toEqual([]);
		expect(
			collectGateFailures(
				VALID_WORKFLOW.replace("    needs: build", "    needs: [build]"),
			),
		).toEqual([]);

		for (const [label, yaml, cause] of BYPASSES) {
			expect(collectGateFailures(yaml).join("\n"), label).toMatch(cause);
		}
	});
});
