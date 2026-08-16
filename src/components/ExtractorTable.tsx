// 採取設備(issue #23)。原料の採取に要る設備の台数・電力を並べる。
// 台数は機械一覧と同じく端数のまま出し、切り上げの建設台数を併記する
// (端数の 1 台は部分負荷で回るので、電力は端数のまま比例させる)。
// 純度とマークは固定の仮定なので、表そのものではなく脚注で明示する
// (選ばせる設定 UI はフォローアップ issue)。
import type { ExtractorRequirement } from "../lib/calc/extractors";
import type { RecipeData } from "../lib/calc/types";
import { extractorLabel, itemLabel } from "../lib/ui/display";
import styles from "./ExtractorTable.module.css";

export function ExtractorTable({
	data,
	requirements,
}: {
	data: RecipeData;
	requirements: ExtractorRequirement[];
}) {
	return (
		<>
			{/* 機械一覧・必要発電機の表と役割が違うので、支援技術から区別できるよう名前を付ける */}
			<table aria-label="採取設備" className={styles.table}>
				<thead>
					<tr>
						<th>資源</th>
						<th>設備</th>
						<th className={styles.numeric}>台数</th>
						<th className={styles.numeric}>電力</th>
					</tr>
				</thead>
				<tbody>
					{requirements.map((requirement) => (
						<tr key={requirement.item}>
							<td>{itemLabel(data, requirement.item)}</td>
							<td className={styles.extractor}>
								{extractorLabel(data, requirement.extractor)}
							</td>
							<td className={styles.numeric}>
								{requirement.count.toDecimalString()} 台（建設{" "}
								{requirement.count.ceil().toString()} 台）
							</td>
							<td className={styles.numeric}>
								{requirement.powerMW.toDecimalString()} MW
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className={styles.note}>
				ノード純度は「普通」、固体資源は採鉱機 Mk.2
				を仮定しています（純度・マークの選択は未対応）。
			</p>
		</>
	);
}
