// 生産チェーン計算機のコンテナ(issue #3)。
// 入力の状態管理と planProduction の呼び出しを担い、表示は部品に委譲する。
// RecipeData は props で受け取る(テストは fixture を注入する)。
import { useMemo, useRef, useState } from "react";
import { planProduction } from "../lib/calc/plan";
import { selectPrimaryRecipes } from "../lib/calc/select";
import type { ProductionPlan, RecipeData } from "../lib/calc/types";
import { filterItemIds } from "../lib/ui/item-search";
import { normalizeRateInput } from "../lib/ui/rate-input";
import { FlowGraph } from "./FlowGraph";
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

	return (
		<div className={styles.planner}>
			<div className={styles.controls}>
				{/* label で包まず htmlFor で関連付ける。0 件メッセージを label 内に置くと
				    検索欄のアクセシブルネームに混入するため(PR #40 レビュー指摘) */}
				<div className={styles.field}>
					<label className={styles.fieldLabel} htmlFor="item-search-input">
						アイテム検索
					</label>
					<div className={styles.searchRow}>
						<input
							id="item-search-input"
							ref={searchInputRef}
							type="search"
							placeholder="名前で絞り込み（例: 鉄 / iron）"
							value={itemQuery}
							onChange={(event) => setItemQuery(event.target.value)}
						/>
						{/* ネイティブの内蔵クリア(✕)はブラウザ依存(Firefox には無い)なので
						    明示のボタンを置く(ブラウザ手動確認でのユーザー要望) */}
						{itemQuery !== "" && (
							<button
								type="button"
								aria-label="検索をクリア"
								className={styles.clearButton}
								onClick={() => {
									setItemQuery("");
									searchInputRef.current?.focus();
								}}
							>
								✕
							</button>
						)}
					</div>
					{/* ライブリージョンは常時マウントしテキストだけ切り替える。
					    後から要素ごと現れると読み上げを取りこぼすスクリーンリーダーがある */}
					<span role="status" className={styles.noMatch}>
						{matchedIds.size === 0 ? "該当するアイテムがありません" : ""}
					</span>
				</div>
				<label className={styles.field}>
					<span className={styles.fieldLabel}>アイテム</span>
					{/* 閉じたドロップダウンだと検索欄にフォーカスした時点で候補が見えなくなる
					    (ブラウザ手動確認での指摘)ため、size で常時表示のリストボックスにする */}
					<select
						size={8}
						value={itemId}
						onChange={(event) => setItemId(event.target.value)}
					>
						{visibleOptions.map((option) => (
							<option key={option.id} value={option.id}>
								{option.label}
							</option>
						))}
					</select>
				</label>
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
