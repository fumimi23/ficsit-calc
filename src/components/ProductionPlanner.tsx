// 生産チェーン計算機のコンテナ(issue #3)。
// 入力の状態管理と planProduction の呼び出しを担い、表示は部品に委譲する。
// RecipeData は props で受け取る(テストは fixture を注入する)。
import { useMemo, useState } from "react";
import { planProduction } from "../lib/calc/plan";
import { selectPrimaryRecipes } from "../lib/calc/select";
import type { ProductionPlan, RecipeData } from "../lib/calc/types";
import { normalizeRateInput } from "../lib/ui/rate-input";
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
	const [rateText, setRateText] = useState("");

	const selection = useMemo(() => selectPrimaryRecipes(data), [data]);
	const itemOptions = useMemo(
		() =>
			Object.entries(data.items)
				.map(([id, def]) => ({ id, label: def.nameJa ?? def.name }))
				.sort((a, b) => a.label.localeCompare(b.label, "ja")),
		[data],
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
				<label className={styles.field}>
					アイテム
					<select
						value={itemId}
						onChange={(event) => setItemId(event.target.value)}
					>
						<option value="">-- 選択してください --</option>
						{itemOptions.map((option) => (
							<option key={option.id} value={option.id}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className={styles.field}>
					目標レート（個/分）
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
							/>
						</section>
					)}
					<p className={styles.total}>
						総電力: {state.plan.totalPowerMW.toDecimalString()} MW
					</p>
					<section>
						<h2>生産ツリー</h2>
						<PlanTree data={data} root={state.plan.root} />
					</section>
				</div>
			)}
		</div>
	);
}
