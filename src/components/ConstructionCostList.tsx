// 建設コストの一覧(issue #21)。レートではなく建てるのに要る総個数なので、
// ItemRateList(〜/分)とは単位も意味も違う別リストにする。
import type { ItemQuantity } from "../lib/calc/construction";
import type { RecipeData } from "../lib/calc/types";
import { itemLabel } from "../lib/ui/display";
import styles from "./ConstructionCostList.module.css";

export function ConstructionCostList({
	data,
	label,
	quantities,
}: {
	data: RecipeData;
	label: string;
	quantities: ItemQuantity[];
}) {
	return (
		<ul aria-label={label} className={styles.quantities}>
			{quantities.map((quantity) => (
				<li key={quantity.item}>
					{itemLabel(data, quantity.item)}: {quantity.amount.toDecimalString()}{" "}
					個
				</li>
			))}
		</ul>
	);
}
