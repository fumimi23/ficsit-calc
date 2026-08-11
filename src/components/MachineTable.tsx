// 機械一覧(issue #3)。台数は小数のまま表示し、切り上げの建設台数を併記する。
// クロック率の提案は #14(電力カーブ対応とセット)まで出さない。
import type { MachineRequirement, RecipeData } from "../lib/calc/types";
import { buildingLabel, recipeLabel } from "../lib/ui/display";
import styles from "./MachineTable.module.css";

export function MachineTable({
	data,
	machines,
}: {
	data: RecipeData;
	machines: MachineRequirement[];
}) {
	return (
		<table className={styles.table}>
			<thead>
				<tr>
					<th>レシピ</th>
					<th>機械</th>
					<th className={styles.numeric}>台数</th>
					<th className={styles.numeric}>電力</th>
				</tr>
			</thead>
			<tbody>
				{machines.map((machine) => (
					<tr key={machine.recipeId}>
						<td>{recipeLabel(data, machine.recipeId)}</td>
						<td className={styles.building}>
							{buildingLabel(data, machine.building)}
						</td>
						<td className={styles.numeric}>
							{machine.machineCount.toDecimalString()} 台（建設{" "}
							{machine.machineCount.ceil().toString()} 台）
						</td>
						<td className={styles.numeric}>
							{machine.powerMW.toDecimalString()} MW
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
