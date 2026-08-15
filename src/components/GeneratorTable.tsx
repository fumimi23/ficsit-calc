// 必要発電機リスト(issue #20)。総電力を賄う台数と、その電力を維持する燃料/副資材を並べる。
// 燃料を複数燃やせる発電機は燃料ごとに行を分ける(どれで賄うかはプレイヤーの選択)。
// 台数は切り上げだが燃料は実負荷ベースなので、台数 × 定格からは逆算できない値になる。
// 建設コスト(issue #21)も種別ごとに併記する: 種別は代替案の並記なので合算しない。
import { generatorConstructionCost } from "../lib/calc/construction";
import type { GeneratorRequirement } from "../lib/calc/generators";
import type { ItemRate, RecipeData } from "../lib/calc/types";
import { generatorLabel, itemLabel } from "../lib/ui/display";
import styles from "./GeneratorTable.module.css";

export function GeneratorTable({
	data,
	requirements,
}: {
	data: RecipeData;
	requirements: GeneratorRequirement[];
}) {
	return (
		// 機械一覧の表と役割が違うので、支援技術から区別できるよう名前を付ける
		<table aria-label="必要発電機" className={styles.table}>
			<thead>
				<tr>
					<th>発電機</th>
					<th className={styles.numeric}>台数</th>
					<th>燃料</th>
					<th>副資材</th>
					<th>建設コスト</th>
				</tr>
			</thead>
			<tbody>
				{requirements.flatMap((requirement) =>
					requirement.fuelOptions.map((option, index) => (
						<tr key={`${requirement.generator}/${option.fuel.item}`}>
							{/* 発電機名と台数は燃料の選び方に依らないので、燃料が複数ある発電機では
							    行をまたいで 1 セルにまとめる */}
							{index === 0 && (
								<>
									<td rowSpan={requirement.fuelOptions.length}>
										{generatorLabel(data, requirement.generator)}
									</td>
									<td
										className={styles.numeric}
										rowSpan={requirement.fuelOptions.length}
									>
										{requirement.count.toString()} 台
									</td>
								</>
							)}
							<td>
								<RateCell data={data} rate={option.fuel} />
							</td>
							<td className={styles.supplemental}>
								{option.supplemental ? (
									<RateCell data={data} rate={option.supplemental} />
								) : (
									// 空欄だと「まだ調べていない」に見えるので明示的に「無し」を置く
									"—"
								)}
							</td>
							{/* 建設コストも燃料の選び方に依らないので台数と同じくまとめる */}
							{index === 0 && (
								<td rowSpan={requirement.fuelOptions.length}>
									<CostCell data={data} requirement={requirement} />
								</td>
							)}
						</tr>
					)),
				)}
			</tbody>
		</table>
	);
}

function CostCell({
	data,
	requirement,
}: {
	data: RecipeData;
	requirement: GeneratorRequirement;
}) {
	const cost = generatorConstructionCost(data, requirement);
	// 台数 0(素材なし)で空欄にすると「まだ調べていない」に見える
	if (cost.length === 0) return <>—</>;
	return (
		<ul className={styles.cost}>
			{cost.map((quantity) => (
				<li key={quantity.item}>
					{itemLabel(data, quantity.item)}:{" "}
					<span className={styles.quantity}>
						{quantity.amount.toDecimalString()} 個
					</span>
				</li>
			))}
		</ul>
	);
}

function RateCell({ data, rate }: { data: RecipeData; rate: ItemRate }) {
	return (
		<>
			{itemLabel(data, rate.item)}{" "}
			<span className={styles.rate}>
				{rate.ratePerMinute.toDecimalString()} /分
			</span>
		</>
	);
}
