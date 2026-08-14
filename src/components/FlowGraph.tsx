// 接続図(issue #18)。計画 → mermaid 記法の変換は純関数(lib/ui/flow-graph)に任せ、
// ここは mermaid での SVG 化と表示状態(描画中/成功/失敗)だけを持つ。
// mermaid はバンドルが大きいため動的 import で初回描画まで読み込みを遅延する
import { useEffect, useMemo, useState } from "react";
import type { ProductionPlan, RecipeData } from "../lib/calc/types";
import { planToMermaid } from "../lib/ui/flow-graph";
import styles from "./FlowGraph.module.css";

type RenderState =
	| { kind: "rendering" }
	| { kind: "ready"; svg: string }
	| { kind: "error"; message: string };

// mermaid.render の要素 ID はページ内で一意にする(同一 ID の再描画は mermaid が拒む)
let renderSequence = 0;

/** 図面トークン(tokens.css)の実効値。mermaid は CSS 変数を解決しないため実行時に読む */
function themeToken(name: string, fallback: string): string {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return value === "" ? fallback : value;
}

export function FlowGraph({
	data,
	plan,
}: {
	data: RecipeData;
	plan: ProductionPlan;
}) {
	const source = useMemo(() => planToMermaid(data, plan), [data, plan]);
	const [state, setState] = useState<RenderState>({ kind: "rendering" });

	useEffect(() => {
		let cancelled = false;
		setState({ kind: "rendering" });
		(async () => {
			const { default: mermaid } = await import("mermaid");
			mermaid.initialize({
				startOnLoad: false,
				theme: "base",
				themeVariables: {
					fontFamily: themeToken("--font-sans", "sans-serif"),
					primaryColor: themeToken("--surface", "#ffffff"),
					primaryTextColor: themeToken("--ink", "#24303e"),
					primaryBorderColor: themeToken("--line-strong", "#7d90a5"),
					lineColor: themeToken("--line-strong", "#7d90a5"),
					textColor: themeToken("--ink", "#24303e"),
					edgeLabelBackground: themeToken("--surface", "#ffffff"),
				},
				// 横幅への縮小フィットは文字が潰れるため無効化し、横スクロールで見せる
				flowchart: { useMaxWidth: false },
			});
			const { svg } = await mermaid.render(
				`flow-graph-${renderSequence++}`,
				source,
			);
			if (!cancelled) setState({ kind: "ready", svg });
		})().catch((error) => {
			if (!cancelled) {
				setState({
					kind: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		});
		return () => {
			cancelled = true;
		};
	}, [source]);

	return (
		<figure aria-label="接続図" className={styles.figure}>
			{state.kind === "rendering" && <p className={styles.note}>描画中…</p>}
			{state.kind === "error" && (
				<p role="alert" className={styles.alert}>
					接続図を描画できませんでした: {state.message}
				</p>
			)}
			{state.kind === "ready" && (
				// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid が生成した SVG の埋め込み(入力はアプリ内の計画データのみ)
				<div dangerouslySetInnerHTML={{ __html: state.svg }} />
			)}
		</figure>
	);
}
