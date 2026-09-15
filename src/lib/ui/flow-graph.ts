// 生産計画 → mermaid flowchart 記法への変換。
// ノード = 機械グループ(レシピ・機械 × 台数)・原料・余剰・目標、
// エッジ = アイテムの流量(個/分)。ツリーで枝ごとに重複する中間素材は
// (生産元, 消費先, アイテム) 単位で合算し 1 本のエッジに集約する。
// primary 選択によりアイテムの生産元は高々 1 つなので、集約は決定的。
// SVG への描画は mermaid に委譲する(このモジュールは文字列を作るだけの純関数)。
import { Fraction } from "../calc/fraction";
import type { PlanNode, ProductionPlan, RecipeData } from "../calc/types";
import { buildingLabel, itemLabel, recipeLabel } from "./display";

type NodeKind = "recipe" | "raw" | "surplus" | "target";

/**
 * mermaid のノード ID を割り当てる。ID に使えない文字を "_" に潰すため、
 * 別のレシピ/アイテムが同じ ID に衝突しうる。宣言時に採番して衝突は連番で逃がし、
 * エッジからの参照は宣言済みの割り当てを引く(未宣言参照はプログラミングエラー)。
 */
class NodeIds {
	private readonly assigned = new Map<string, string>();
	private readonly taken = new Set<string>();

	declare(kind: NodeKind, rawId: string): string {
		const key = `${kind}|${rawId}`;
		const existing = this.assigned.get(key);
		if (existing) return existing;
		const base = `${kind}_${rawId.replace(/[^A-Za-z0-9_]/g, "_")}`;
		let id = base;
		for (let n = 2; this.taken.has(id); n++) {
			id = `${base}_${n}`;
		}
		this.assigned.set(key, id);
		this.taken.add(id);
		return id;
	}

	ref(kind: NodeKind, rawId: string): string {
		const id = this.assigned.get(`${kind}|${rawId}`);
		if (!id) {
			throw new Error(`接続図に未宣言のノードを参照しました: ${kind} ${rawId}`);
		}
		return id;
	}
}

/** mermaid の引用符付きラベルに埋め込める形にする(引用符は mermaid のエンティティ表記へ) */
function escapeLabel(text: string): string {
	return text.replace(/"/g, "#quot;");
}

/**
 * 生産計画を mermaid flowchart 記法(TD: 原料が上、目標が下)の文字列に変換する。
 * 横長(LR)は紙面からはみ出しやすく、縦長のほうがスクロールが自然という
 * ユーザー判断(ブラウザ手動確認での要望)による。
 * ノード宣言(機械グループ → 原料 → 余剰 → 目標)、エッジ(ツリーの深さ優先で
 * 出現順、最後に目標への 1 本)の順に並べ、同じ入力に対して常に同じ文字列を返す。
 */
export function planToMermaid(data: RecipeData, plan: ProductionPlan): string {
	const ids = new NodeIds();
	const lines: string[] = ["flowchart TD"];

	for (const m of plan.machines) {
		const id = ids.declare("recipe", m.recipeId);
		const label = `${escapeLabel(recipeLabel(data, m.recipeId))}<br/>${escapeLabel(
			buildingLabel(data, m.building),
		)} × ${m.machineCount.toDecimalString()}`;
		lines.push(`\t${id}["${label}"]`);
	}
	for (const raw of plan.rawMaterials) {
		const id = ids.declare("raw", raw.item);
		lines.push(
			`\t${id}(["${escapeLabel(itemLabel(data, raw.item))}（原料）"])`,
		);
	}
	for (const byproduct of plan.byproducts) {
		const id = ids.declare("surplus", byproduct.item);
		lines.push(
			`\t${id}(["${escapeLabel(itemLabel(data, byproduct.item))}（余剰）"])`,
		);
	}
	const targetId = ids.declare("target", plan.root.item);
	lines.push(
		`\t${targetId}(["${escapeLabel(itemLabel(data, plan.root.item))}（目標）"])`,
	);

	// エッジは (生産元, 消費先, アイテム) 単位で合算する。挿入順 = ツリーの深さ優先の初出順
	const edges = new Map<
		string,
		{ from: string; to: string; item: string; rate: Fraction }
	>();
	const addEdge = (from: string, to: string, item: string, rate: Fraction) => {
		const key = `${from}|${to}|${item}`;
		const entry = edges.get(key) ?? { from, to, item, rate: Fraction.of(0) };
		entry.rate = entry.rate.add(rate);
		edges.set(key, entry);
	};
	const producerOf = (node: PlanNode): string =>
		node.production
			? ids.ref("recipe", node.production.recipeId)
			: ids.ref("raw", node.item);

	const recipesById = new Map(data.recipes.map((r) => [r.id, r]));
	const walk = (node: PlanNode) => {
		if (!node.production) return;
		const nodeId = ids.ref("recipe", node.production.recipeId);
		const recipe = recipesById.get(node.production.recipeId);
		const output = recipe?.outputs.find((o) => o.item === node.item);
		if (!recipe || !output) {
			// planProduction が同じ data から作った計画では起きない
			throw new Error(
				`計画のレシピがデータに見つかりません: ${node.production.recipeId}`,
			);
		}
		// 余剰の産出量はレシピ定義から復元する(plan.byproducts は産出元を持たない合計値のため)
		const craftsPerMinute = node.ratePerMinute.div(
			Fraction.from(output.amount),
		);
		for (const other of recipe.outputs) {
			if (other.item === node.item) continue;
			addEdge(
				nodeId,
				ids.ref("surplus", other.item),
				other.item,
				Fraction.from(other.amount).mul(craftsPerMinute),
			);
		}
		for (const child of node.inputs) {
			addEdge(producerOf(child), nodeId, child.item, child.ratePerMinute);
			walk(child);
		}
	};
	walk(plan.root);
	addEdge(
		producerOf(plan.root),
		targetId,
		plan.root.item,
		plan.root.ratePerMinute,
	);

	for (const edge of edges.values()) {
		const label = `${escapeLabel(itemLabel(data, edge.item))} ${edge.rate.toDecimalString()} /分`;
		lines.push(`\t${edge.from} -- "${label}" --> ${edge.to}`);
	}
	return lines.join("\n");
}
