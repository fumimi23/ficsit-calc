// 生産チェーン計算機のコンテナ(issue #3)。
// 入力の状態管理と planProduction の呼び出しを担い、表示は部品に委譲する。
// RecipeData は props で受け取る(テストは fixture を注入する)。
import { useEffect, useMemo, useRef, useState } from "react";
import { sumMachineConstructionCost } from "../lib/calc/construction";
import { planGenerators } from "../lib/calc/generators";
import { planProduction } from "../lib/calc/plan";
import { selectPrimaryRecipes } from "../lib/calc/select";
import type { ProductionPlan, RecipeData } from "../lib/calc/types";
import { filterItemIds } from "../lib/ui/item-search";
import { normalizeRateInput } from "../lib/ui/rate-input";
import { ConstructionCostList } from "./ConstructionCostList";
import { FlowGraph } from "./FlowGraph";
import { GeneratorTable } from "./GeneratorTable";
import { ItemRateList } from "./ItemRateList";
import { MachineTable } from "./MachineTable";
import { PlanTree } from "./PlanTree";
import styles from "./ProductionPlanner.module.css";

type PlanState =
	| { kind: "idle" }
	| { kind: "error"; message: string }
	| { kind: "ready"; plan: ProductionPlan };

export function ProductionPlanner({ data }: { data: RecipeData }) {
	const [itemId, setItemId] = useState("");
	const [itemQuery, setItemQuery] = useState("");
	const [rateText, setRateText] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const itemSelectRef = useRef<HTMLSelectElement>(null);

	const selection = useMemo(() => selectPrimaryRecipes(data), [data]);
	const itemOptions = useMemo(
		() =>
			Object.entries(data.items)
				.map(([id, def]) => ({ id, label: def.nameJa ?? def.name }))
				.sort((a, b) => a.label.localeCompare(b.label, "ja")),
		[data],
	);
	const matchedIds = useMemo(
		() => new Set(filterItemIds(data.items, itemQuery)),
		[data, itemQuery],
	);
	// 選択済みアイテムは検索から外れても option に残す。外すと select の表示が
	// プレースホルダーに戻り、表示中の計画と食い違うため
	const visibleOptions = itemOptions.filter(
		(option) => matchedIds.has(option.id) || option.id === itemId,
	);

	// 絞り込みの変化でリストが作り直されてもスクロール位置は変わらないため、
	// 選択行が表示窓の外に出て見えなくなることがある。リストの中身が変わる
	// たびに選択行を表示範囲へ入れる。検索をクリアして全件に戻った瞬間だけは
	// 「見える」では足りず選択行を窓の一番上に置く(ブラウザ手動確認での要望)。
	// クリック選択の直後まで一番上へ飛ばすと画面が跳ねるので、遷移を区別する
	const prevQueryRef = useRef("");
	// biome-ignore lint/correctness/useExhaustiveDependencies: itemId / matchedIds はリスト再構築の検知用
	useEffect(() => {
		const select = itemSelectRef.current;
		const selected = select?.selectedOptions[0];
		const queryCleared = prevQueryRef.current !== "" && itemQuery.trim() === "";
		prevQueryRef.current = itemQuery.trim();
		// 未選択時の selectedOptions[0] は不可視の受け皿 option。display:none の
		// rect は全ゼロで scrollTop 計算が無関係な位置へ飛ぶため、スクロールしない
		if (!select || !selected || selected.hidden) return;
		if (queryCleared) {
			// option.offsetTop は select ではなく offsetParent(ページ側の祖先)基準
			// なので使えない。画面上の位置差分からスクロール量を決める
			select.scrollTop +=
				selected.getBoundingClientRect().top -
				select.getBoundingClientRect().top;
		} else {
			// jsdom には scrollIntoView が無いので optional call にする
			selected.scrollIntoView?.({ block: "nearest" });
		}
	}, [itemId, matchedIds, itemQuery]);

	const state: PlanState = useMemo(() => {
		// 未選択・未入力はエラーではなく単に結果なし
		if (itemId === "" || rateText.trim() === "") {
			return { kind: "idle" };
		}
		const rate = normalizeRateInput(rateText);
		if (!rate.ok) {
			return { kind: "error", message: rate.message };
		}
		try {
			return {
				kind: "ready",
				plan: planProduction(
					data,
					{ itemId, ratePerMinute: rate.value },
					selection,
				),
			};
		} catch (error) {
			return {
				kind: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}, [data, selection, itemId, rateText]);

	// 機械が 1 台も要らない計画(原料だけ)では建てるものが無いのでセクションごと出さない
	const constructionCost = useMemo(
		() =>
			state.kind === "ready"
				? sumMachineConstructionCost(data, state.plan.machines)
				: [],
		[data, state],
	);

	// 総電力 0(原料だけの計画)や発電機を持たないデータでは行が 1 つも立たない。
	// 0 台の表を出すと「発電機ゼロ台で足りる」と読めてしまうのでセクションごと出さない
	const generatorRequirements = useMemo(
		() =>
			state.kind === "ready" && !state.plan.totalPowerMW.isZero()
				? planGenerators(data, state.plan.totalPowerMW)
				: [],
		[data, state],
	);

	return (
		<div className={styles.planner}>
			<div className={styles.controls}>
				{/* 検索欄はリストを操作する道具なので、リストの真上に置いて
				    「アイテム」1 ブロックにまとめる(ブラウザ手動確認での指摘)。
				    可視ラベルはブロックに 1 つだけ置いて select に関連付け、検索欄の
				    アクセシブルネームは aria-label で与える(label 要素に足すと
				    0 件メッセージ等が名前に混入しやすい — PR #40 レビュー指摘) */}
				<div className={styles.field}>
					<label className={styles.fieldLabel} htmlFor="item-select">
						アイテム
					</label>
					<div className={styles.searchRow}>
						<input
							ref={searchInputRef}
							type="search"
							aria-label="アイテム検索"
							placeholder="名前で絞り込み（例: 鉄 / iron）"
							value={itemQuery}
							onChange={(event) => setItemQuery(event.target.value)}
						/>
						{/* ネイティブの内蔵クリア(✕)はブラウザ依存(Firefox には無い)なので
						    明示のボタンを置く。出没させると検索行の幅が変わって段差が出る
						    ため常時表示し、空のときは disabled にする(ブラウザ手動確認での要望) */}
						<button
							type="button"
							aria-label="検索をクリア"
							className={styles.clearButton}
							disabled={itemQuery === ""}
							onClick={() => {
								setItemQuery("");
								searchInputRef.current?.focus();
							}}
						>
							✕
						</button>
					</div>
					{/* ライブリージョンは常時マウントしテキストだけ切り替える。
					    後から要素ごと現れると読み上げを取りこぼすスクリーンリーダーがある */}
					<span role="status" className={styles.noMatch}>
						{matchedIds.size === 0 ? "該当するアイテムがありません" : ""}
					</span>
					{/* 閉じたドロップダウンだと検索欄にフォーカスした時点で候補が見えなくなる
					    (ブラウザ手動確認での指摘)ため、size で常時表示のリストボックスにする */}
					<select
						id="item-select"
						ref={itemSelectRef}
						size={8}
						value={itemId}
						onChange={(event) => setItemId(event.target.value)}
					>
						{/* 未選択(value="")の受け皿。React は一致する option が無い controlled
						    select で先頭の option に選択状態を立てるため、これが無いと未選択でも
						    先頭行が選択色になる。hidden で見せず disabled でキー操作からも外す */}
						<option value="" disabled hidden />
						{visibleOptions.map((option) => (
							<option key={option.id} value={option.id}>
								{option.label}
							</option>
						))}
					</select>
				</div>
				<label className={styles.field}>
					<span className={styles.fieldLabel}>目標レート（個/分）</span>
					<input
						type="text"
						inputMode="decimal"
						placeholder="例: 30"
						value={rateText}
						onChange={(event) => setRateText(event.target.value)}
					/>
				</label>
			</div>

			{state.kind === "error" && (
				<p role="alert" className={styles.alert}>
					{state.message}
				</p>
			)}

			{state.kind === "ready" && (
				<div className={styles.results}>
					<section>
						<h2>機械一覧</h2>
						<MachineTable data={data} machines={state.plan.machines} />
					</section>
					{constructionCost.length > 0 && (
						<section>
							{/* 発電機分を含まないことが見出しから読み取れるようにする */}
							<h2>建設コスト（機械分）</h2>
							<ConstructionCostList
								data={data}
								label="建設コスト（機械分）"
								quantities={constructionCost}
							/>
						</section>
					)}
					<div className={styles.rateColumns}>
						<section>
							<h2>原料合計</h2>
							<ItemRateList
								data={data}
								label="原料合計"
								rates={state.plan.rawMaterials}
							/>
						</section>
						{state.plan.byproducts.length > 0 && (
							<section>
								<h2>余剰（副産物）</h2>
								<ItemRateList
									data={data}
									label="余剰（副産物）"
									rates={state.plan.byproducts}
									variant="byproduct"
								/>
							</section>
						)}
					</div>
					<p className={styles.total}>
						総電力: {state.plan.totalPowerMW.toDecimalString()} MW
					</p>
					{generatorRequirements.length > 0 && (
						<section>
							<h2>必要発電機</h2>
							<GeneratorTable
								data={data}
								requirements={generatorRequirements}
							/>
						</section>
					)}
					<section>
						<h2>生産ツリー</h2>
						<PlanTree data={data} root={state.plan.root} />
					</section>
					<section>
						<h2>接続図</h2>
						<FlowGraph data={data} plan={state.plan} />
					</section>
				</div>
			)}
		</div>
	);
}
