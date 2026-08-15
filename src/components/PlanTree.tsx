// 中間素材の連鎖の階層表示(issue #3)。production を持たない葉は原料。
// ノードごとのレシピ切り替え(issue #22)は、その場で差し替えられるよう
// ノード行にドロップダウンとして置く(別セクションの一覧にはしない)。
// アイテム名の後ろに足す形にしないのは、デフォルトレシピはレシピ名 = アイテム名が
// 多く「アルミのスクラップ 60 /分 [アルミのスクラップ]」と二重に読めるため
// (ブラウザ手動確認での指摘)。行頭の名前部分そのものをドロップダウンにする。
import type { RecipeSelection } from "../lib/calc/select";
import type {
	ItemId,
	PlanNode,
	RecipeData,
	RecipeDef,
} from "../lib/calc/types";
import { itemLabel, recipeLabel } from "../lib/ui/display";
import styles from "./PlanTree.module.css";

interface RecipePicker {
	/** アイテム → 第 1 出力が一致するレシピ(candidateRecipesByItem) */
	candidates: ReadonlyMap<ItemId, readonly RecipeDef[]>;
	/** 上書き前の選択。既定値(原料終端かどうか)の判定に使う */
	primary: RecipeSelection;
	/** 選ばれたレシピ ID。原料として扱う選択は "" */
	onSelect: (itemId: ItemId, recipeId: string) => void;
}

export function PlanTree({
	data,
	root,
	picker,
}: {
	data: RecipeData;
	root: PlanNode;
	picker: RecipePicker;
}) {
	return (
		<ul aria-label="生産ツリー" className={styles.tree}>
			<TreeItem data={data} node={root} picker={picker} />
		</ul>
	);
}

function TreeItem({
	data,
	node,
	picker,
}: {
	data: RecipeData;
	node: PlanNode;
	picker: RecipePicker;
}) {
	const isRaw = !node.production;
	const rate = `${node.ratePerMinute.toDecimalString()} /分`;
	const label = `${itemLabel(data, node.item)} ${rate}`;
	const choices = recipeChoices(node, picker);
	return (
		<li>
			<span className={isRaw ? `${styles.node} ${styles.raw}` : styles.node}>
				{choices ? (
					<>
						<NodeRecipePicker
							data={data}
							node={node}
							picker={picker}
							choices={choices}
						/>
						<span className={styles.rate}>{rate}</span>
					</>
				) : (
					`${label}${isRaw ? "（原料）" : ""}`
				)}
			</span>
			{node.inputs.length > 0 && (
				<ul>
					{node.inputs.map((child) => (
						<TreeItem
							key={child.item}
							data={data}
							node={child}
							picker={picker}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

interface RecipeChoices {
	candidates: readonly RecipeDef[];
	hasPrimary: boolean;
}

/** ドロップダウンを出すノードの選択肢。出さないノードは undefined */
function recipeChoices(
	node: PlanNode,
	picker: RecipePicker,
): RecipeChoices | undefined {
	const candidates = picker.candidates.get(node.item) ?? [];
	// primary を持つアイテムは常にどれかのレシピで作られているので、候補 1 本では
	// 選びようがない。持たないアイテムは「原料として扱う」との 2 択があるので 1 本でも出す。
	// 上書き中でも出し続けないと原料終端に戻せなくなる
	const hasPrimary = picker.primary.has(node.item);
	if (candidates.length < (hasPrimary ? 2 : 1)) return undefined;
	return { candidates, hasPrimary };
}

function NodeRecipePicker({
	data,
	node,
	picker,
	choices,
}: {
	data: RecipeData;
	node: PlanNode;
	picker: RecipePicker;
	choices: RecipeChoices;
}) {
	return (
		<select
			className={styles.picker}
			aria-label={`${itemLabel(data, node.item)}のレシピ`}
			value={node.production?.recipeId ?? ""}
			onChange={(event) => picker.onSelect(node.item, event.target.value)}
		>
			{/* 閉じた状態では選択中の option だけが行頭に出る。「原料として扱う」だと
			    アイテム名が行から消えるので、既定の選択肢もアイテム名で名乗らせる */}
			{!choices.hasPrimary && (
				<option value="">{`${itemLabel(data, node.item)}（原料）`}</option>
			)}
			{choices.candidates.map((recipe) => (
				<option key={recipe.id} value={recipe.id}>
					{recipeLabel(data, recipe.id)}
				</option>
			))}
		</select>
	);
}
