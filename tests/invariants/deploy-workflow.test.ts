// issue #62 invariants: Pages へ公開する前のゲート(scripts/check.sh)が外れていないことを固定する。
// workflow 自体は vitest で実行できないので、台帳に載せられるのは deploy.yml の静的検査だけ。
// 「check.sh の step がある」だけでは足りない。continue-on-error / if / `|| true` / 行末コメント /
// ゲートを通らない 2 本目の job を足すと、step を残したまま公開だけを素通りさせられる。
// そのため「ゲートが実際に効く形か」まで見る。
// job は使っている action から特定するので、公式 Pages Action(upload-pages-artifact / deploy-pages)で
// 公開すること自体もここで固定していることになる。別方式へ移すときはこの台帳ごと書き換える。
// 固定しないもの: action のバージョン・step 名・job 名・Node のバージョン・concurrency の値・
// step の並び順・npm ci / npm run build の有無。
// 射程:
// - `run: |` は許すが、ブロック内のシェル条件分岐(`if ...; then`)までは追わない
//   (`set +e` による errexit 無効化だけは個別に弾く)。
// - `if` / `shell` はキーの存在だけで失敗にする。強化目的の条件(`if: github.ref == ...`)や
//   `shell: bash` の明示を足すときも台帳の書き換えが要る(既定の `bash -e {0}` から外れる形は区別しない)。
// - ゲートの呼び出しは `sh|bash scripts/check.sh` の 1 形に固定する。`npm run check` 経由は等価でも red
//   (別名経由を許すと、その別名の中身を空にしてゲートを抜けられる)。
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

// `run: |` の中で errexit を切ると、check.sh が落ちても step は成功扱いになる
const ERREXIT_OFF = /^set\s+\+(?:[a-zA-Z]*e[a-zA-Z]*|o\s+errexit)\b/;

// 失敗しても後続を止めない / そもそも実行しない、を作れるキー
const DISABLING_KEYS = ["continue-on-error", "if"];

// run の既定シェルは `bash -e {0}`。`shell: bash {0}` に差し替えると -e が外れ、
// ゲートの後ろに別のコマンドを置くだけで check.sh の失敗を握りつぶせる
const GATE_STEP_DISABLING_KEYS = [...DISABLING_KEYS, "shell"];

// これを置くと main への push でも workflow ごと起動しなくなる
const PATH_FILTER_KEYS = ["paths", "paths-ignore"];

// `"continue-on-error": true` のような引用符付きのキーでも同じ意味になる
const KEY_PATTERN = /^["']?([A-Za-z0-9_-]+)["']?:/;

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
	let itemIndent = -1;
	for (const line of lines.slice(index + 1)) {
		if (line.trim() === "") {
			continue;
		}
		const item = /^(\s+)-\s*(.+)$/.exec(line);
		if (item === null || (itemIndent !== -1 && item[1].length !== itemIndent)) {
			break;
		}
		itemIndent = item[1].length;
		// `- main # 本番のみ` のような行末コメント付きでも要素を落とさない(落とすと正当な workflow が red になる)
		const value = unquote(stripInlineComment(item[2]));
		if (value === "") {
			break;
		}
		items.push(value);
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

function pushBlock(yaml: string): string[] {
	const onBlock = topLevelBlock(yaml, /^on:\s*$/);
	const pushIndex = onBlock.findIndex((line) => /^ {2}push:\s*$/.test(line));
	if (pushIndex === -1) {
		return [];
	}
	const block: string[] = [];
	for (const line of onBlock.slice(pushIndex + 1)) {
		if (indentOf(line) <= 2) {
			break;
		}
		block.push(line);
	}
	return block;
}

function pushBranches(yaml: string): string[] {
	return sequenceValue(pushBlock(yaml), /^ {4}branches:(.*)$/);
}

function pushPathFilters(yaml: string): string[] {
	return pushBlock(yaml).flatMap((line) => {
		const key = KEY_PATTERN.exec(line.slice(4));
		return key !== null && PATH_FILTER_KEYS.includes(key[1]) ? [key[1]] : [];
	});
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
		if (indentOf(line) !== 4) {
			return [];
		}
		const key = KEY_PATTERN.exec(line.slice(4));
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
			KEY_PATTERN.exec(line.slice(keyColumn))?.[1] === "run",
	);
	if (index === -1) {
		return [];
	}
	const inline = stripInlineComment(
		lines[index].slice(keyColumn).replace(KEY_PATTERN, ""),
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
		const key = KEY_PATTERN.exec(line.slice(keyColumn));
		return key === null ? [] : [key[1]];
	});
	return { keys, commands: runCommands(lines, keyColumn) };
}

function collectGateFailures(yaml: string): string[] {
	const failures: string[] = [];
	if (!pushBranches(yaml).includes("main")) {
		failures.push("on.push.branches に main が無い");
	}
	for (const key of pushPathFilters(yaml)) {
		failures.push(`on.push に ${key} がある`);
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
			if (GATE_STEP_DISABLING_KEYS.includes(key)) {
				failures.push(
					`job "${artifactJob.name}" のゲート step に ${key} がある`,
				);
			}
		}
		for (const command of step.commands) {
			// `set -e; set +e` のように区切りの後ろへ置かれても拾う
			for (const segment of command.split(/\s*(?:;|&&)\s*/)) {
				if (ERREXIT_OFF.test(segment)) {
					failures.push(
						`job "${artifactJob.name}" のゲート step に set +e (errexit の無効化)がある`,
					);
				}
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
		VALID_WORKFLOW +
			[
				"  deploy-hotfix:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/deploy-pages@v5",
				"",
			].join("\n"),
		/actions\/deploy-pages/,
	],
	[
		"N: ゲートを通らない 2 本目の artifact job",
		VALID_WORKFLOW.replace(
			"    needs: build",
			"    needs: [build, build-fast]",
		) +
			[
				"  build-fast:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/upload-pages-artifact@v5",
				"",
			].join("\n"),
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
	[
		"X1: run: | の中で set +e を置く",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: |\n          set +e\n          sh scripts/check.sh",
		),
		/set \+e/,
	],
	[
		"X1: 区切りの後ろに set +e を置く",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: |\n          set -e; set +e\n          sh scripts/check.sh",
		),
		/set \+e/,
	],
	[
		"X5: ゲート step の shell 上書きで -e を外す",
		VALID_WORKFLOW.replace(GATE_STEP, `${GATE_STEP}\n        shell: bash {0}`),
		/shell/,
	],
	[
		"X3: paths-ignore で起動を止める",
		VALID_WORKFLOW.replace(
			"    branches: [main]",
			"    branches: [main]\n    paths-ignore: ['**']",
		),
		/paths-ignore/,
	],
	[
		"X4: 引用符付きキーで continue-on-error を隠す",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			`${GATE_STEP}\n        "continue-on-error": true`,
		),
		/continue-on-error/,
	],
	[
		"X4: 引用符付きキーで deploy job の if を隠す",
		VALID_WORKFLOW.replace(
			"    needs: build",
			"    needs: build\n    'if': always()",
		),
		/\bif\b/,
	],
];

// ゲートが効いたままの正当な書き方。強くしすぎて普通の記法まで red にしていないかの確認
const VALID_VARIANTS: [string, string][] = [
	[
		"needs をフローリストで書く",
		VALID_WORKFLOW.replace("    needs: build", "    needs: [build]"),
	],
	[
		"needs をブロックリストで書く",
		VALID_WORKFLOW.replace("    needs: build", "    needs:\n      - build"),
	],
	[
		"branches をブロックリストで書く",
		VALID_WORKFLOW.replace(
			"    branches: [main]",
			"    branches:\n      - main",
		),
	],
	[
		"ブロックリストの要素に行末コメントを付ける",
		VALID_WORKFLOW.replace(
			"    branches: [main]",
			"    branches:\n      - main # 本番のみ",
		).replace("    needs: build", "    needs:\n      - build # ゲート"),
	],
	[
		"run: | でゲートを呼ぶ",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - run: |\n          npm ci\n          sh scripts/check.sh",
		),
	],
	[
		"./ 付きで呼ぶ",
		VALID_WORKFLOW.replace(GATE_STEP, "      - run: bash ./scripts/check.sh"),
	],
	[
		"step の先頭が name で run が 2 行目",
		VALID_WORKFLOW.replace(
			GATE_STEP,
			"      - name: ローカル CI と同じチェック\n        run: sh scripts/check.sh",
		),
	],
	[
		"ゲート step に行末コメントを付ける",
		VALID_WORKFLOW.replace(GATE_STEP, `${GATE_STEP} # 公開前の関門`),
	],
	[
		"ゲートと無関係な job に if を付ける",
		VALID_WORKFLOW.replace(
			"jobs:",
			"jobs:\n  notify:\n    if: always()\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo done",
		),
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

		for (const [label, yaml] of VALID_VARIANTS) {
			expect(collectGateFailures(yaml), label).toEqual([]);
		}

		for (const [label, yaml, cause] of BYPASSES) {
			expect(collectGateFailures(yaml).join("\n"), label).toMatch(cause);
		}
	});
});
