// アイテム別レートの一覧。原料合計と余剰(副産物)の両方に使う(issue #3)
// variant は行頭マーカーの意味色(原料 = 消費 / 副産物 = 産出)を切り替える(issue #24)
import type { ItemRate, RecipeData } from "../lib/calc/types";
import { itemLabel } from "../lib/ui/display";
import styles from "./ItemRateList.module.css";

export function ItemRateList({
	data,
	label,
	rates,
	variant = "raw",
}: {
	data: RecipeData;
	label: string;
	rates: ItemRate[];
	variant?: "raw" | "byproduct";
}) {
	const className =
		variant === "byproduct"
			? `${styles.rates} ${styles.byproducts}`
			: styles.rates;
	return (
		<ul aria-label={label} className={className}>
			{rates.map((rate) => (
				<li key={rate.item}>
					{itemLabel(data, rate.item)}: {rate.ratePerMinute.toDecimalString()}{" "}
					/分
				</li>
			))}
		</ul>
	);
}
