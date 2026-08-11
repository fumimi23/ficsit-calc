// アイテム別レートの一覧。原料合計と余剰(副産物)の両方に使う(issue #3)
import type { ItemRate, RecipeData } from "../lib/calc/types";
import { itemLabel } from "../lib/ui/display";

export function ItemRateList({
	data,
	label,
	rates,
}: {
	data: RecipeData;
	label: string;
	rates: ItemRate[];
}) {
	return (
		<ul aria-label={label}>
			{rates.map((rate) => (
				<li key={rate.item}>
					{itemLabel(data, rate.item)}: {rate.ratePerMinute.toDecimalString()}{" "}
					/分
				</li>
			))}
		</ul>
	);
}
