// issue #59 invariants: コメント方針(タスク ID 参照を書かない)の再混入を機械的に止める。
// tests/spec/ と tests/invariants/ は約束の台帳で、約束 → 由来の逆引きが issue 側から引けない。
// そのため issue 番号コメントを残す例外扱いとし、走査対象から外している。
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const SCAN_DIRS = ["src", "scripts", "tests"];

const EXCLUDED_DIRS = ["tests/spec", "tests/invariants"];

type CommentStyle = "c-like" | "css" | "hash";

const STYLE_BY_EXTENSION: Record<string, CommentStyle> = {
	".ts": "c-like",
	".tsx": "c-like",
	".astro": "c-like",
	".css": "css",
	".py": "hash",
	".sh": "hash",
};

// 直後が [0-9a-fA-F] のものは CSS の hex 色リテラルの断片(#1f2937 の #1 等)なので除く
const ISSUE_TAG = /#(\d{1,4})(?![0-9a-fA-F])/;

type Violation = { file: string; line: number; text: string };

/**
 * コメント領域に該当する文字位置を true にしたマスクを返す。
 * 文字列リテラル内の `//` や `#` は追跡しない簡易抽出。
 */
function commentMask(source: string, style: CommentStyle): boolean[] {
	const mask = new Array<boolean>(source.length).fill(false);
	let state: "code" | "line" | "block" = "code";
	let i = 0;
	while (i < source.length) {
		const char = source[i];
		const next = source[i + 1];
		if (state === "code") {
			if (style !== "hash" && char === "/" && next === "*") {
				state = "block";
				mask[i] = true;
				mask[i + 1] = true;
				i += 2;
				continue;
			}
			// URL の `://` をコメント開始とみなさない
			if (
				style === "c-like" &&
				char === "/" &&
				next === "/" &&
				source[i - 1] !== ":"
			) {
				state = "line";
				mask[i] = true;
				mask[i + 1] = true;
				i += 2;
				continue;
			}
			if (style === "hash" && char === "#") {
				state = "line";
				mask[i] = true;
				i += 1;
				continue;
			}
			i += 1;
			continue;
		}
		if (state === "line") {
			if (char === "\n") {
				state = "code";
				i += 1;
				continue;
			}
			mask[i] = true;
			i += 1;
			continue;
		}
		if (char === "*" && next === "/") {
			mask[i] = true;
			mask[i + 1] = true;
			state = "code";
			i += 2;
			continue;
		}
		mask[i] = true;
		i += 1;
	}
	return mask;
}

function findIssueTagLines(
	source: string,
	style: CommentStyle,
): { line: number; text: string }[] {
	const mask = commentMask(source, style);
	const lines = source.split("\n");
	const found: { line: number; text: string }[] = [];
	let offset = 0;
	for (const [index, line] of lines.entries()) {
		let commentText = "";
		for (let k = 0; k < line.length; k += 1) {
			if (mask[offset + k]) {
				commentText += line[k];
			}
		}
		if (ISSUE_TAG.test(commentText)) {
			found.push({ line: index + 1, text: line.trim() });
		}
		offset += line.length + 1;
	}
	return found;
}

function isExcluded(relativePath: string): boolean {
	return EXCLUDED_DIRS.some(
		(dir) => relativePath === dir || relativePath.startsWith(`${dir}/`),
	);
}

function collectTargetFiles(): string[] {
	const files: string[] = [];
	for (const dir of SCAN_DIRS) {
		const absoluteDir = path.join(REPO_ROOT, dir);
		for (const entry of readdirSync(absoluteDir, {
			recursive: true,
			withFileTypes: true,
		})) {
			if (!entry.isFile()) {
				continue;
			}
			const absolute = path.join(entry.parentPath, entry.name);
			const relative = path
				.relative(REPO_ROOT, absolute)
				.split(path.sep)
				.join("/");
			if (isExcluded(relative)) {
				continue;
			}
			if (STYLE_BY_EXTENSION[path.extname(entry.name)] === undefined) {
				continue;
			}
			files.push(relative);
		}
	}
	return files.sort();
}

function collectViolations(): Violation[] {
	const violations: Violation[] = [];
	for (const file of collectTargetFiles()) {
		const style = STYLE_BY_EXTENSION[path.extname(file)];
		if (style === undefined) {
			continue;
		}
		const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
		for (const hit of findIssueTagLines(source, style)) {
			violations.push({ file, line: hit.line, text: hit.text });
		}
	}
	return violations;
}

describe("invariants: コメント方針", () => {
	it("src / scripts / tests の unit・fixtures のコメントに issue 番号への参照が無い", () => {
		const files = collectTargetFiles();
		expect(files.length).toBeGreaterThan(0);

		const violations = collectViolations();
		const report = violations.map((v) => `${v.file}:${v.line}: ${v.text}`);

		expect(
			report,
			`コメント内の issue 番号参照:\n${report.join("\n")}`,
		).toEqual([]);
	});

	it("issue 番号を含むコメントを検出できる", () => {
		const tagged = findIssueTagLines(
			"// 建設コストの一覧(issue #21)。\nconst a = 1;\n",
			"c-like",
		);
		expect(tagged).toEqual([
			{ line: 1, text: "// 建設コストの一覧(issue #21)。" },
		]);

		const hexColors = findIssueTagLines(
			"/* 図面トークン。#1f2937 と #0b1220 を使う */\n.node { color: #f3f4f6; }\n",
			"css",
		);
		expect(hexColors).toEqual([]);

		// コメント外の `#21` は検出しない(コメント領域に限定できていることの確認)
		const codeOnly = findIssueTagLines('const id = "#21";\n', "c-like");
		expect(codeOnly).toEqual([]);
	});
});
