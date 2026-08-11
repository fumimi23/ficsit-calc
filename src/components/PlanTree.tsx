// 中間素材の連鎖の階層表示(issue #3)。production を持たない葉は原料
import type { PlanNode, RecipeData } from "../lib/calc/types";
import { itemLabel } from "../lib/ui/display";
import styles from "./PlanTree.module.css";

export function PlanTree({ data, root }: { data: RecipeData; root: PlanNode }) {
	return (
		<ul aria-label="生産ツリー" className={styles.tree}>
			<TreeItem data={data} node={root} />
		</ul>
	);
}

function TreeItem({ data, node }: { data: RecipeData; node: PlanNode }) {
	const label = `${itemLabel(data, node.item)} ${node.ratePerMinute.toDecimalString()} /分`;
	return (
		<li>
			<span>{node.production ? label : `${label}（原料）`}</span>
			{node.inputs.length > 0 && (
				<ul>
					{node.inputs.map((child) => (
						<TreeItem key={child.item} data={data} node={child} />
					))}
				</ul>
			)}
		</li>
	);
}
