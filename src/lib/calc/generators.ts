// 総電力から必要な発電機の台数と燃料レートを逆算する(issue #20)。
// 台数だけは切り上げるが、燃料・副資材は切り上げ後の台数ではなく総電力そのものから出す:
// 端数の 1 台は部分負荷で回るので、定格 × 台数で見積もると要らない燃料まで数えてしまう。
// 生産チェーンとは合流させない(原子力の廃棄物・燃料の生産はスコープ外)。
import { Fraction } from "./fraction";
import type { GeneratorId, ItemRate, RecipeData } from "./types";

/** 1 種類の燃料で賄う場合の必要レート。どの燃料で賄うかはプレイヤーの選択なので併記する */
export interface GeneratorFuelOption {
	fuel: ItemRate;
	/** 副資材(石炭発電機の水など)。要らない発電機では付かない */
	supplemental?: ItemRate;
}

export interface GeneratorRequirement {
	generator: GeneratorId;
	/** 必要台数(切り上げの整数)。端数の台も 1 台建てないと電力が足りない */
	count: bigint;
	/** data.generators の fuels と同じ並び */
	fuelOptions: GeneratorFuelOption[];
}

const SIXTY = Fraction.of(60);

/**
 * 総電力(MW)を賄うのに必要な発電機を、data.generators の並び順で返す。
 * 総電力 0 でも行は消さず、台数 0・レート 0 の行を全発電機分返す
 * (表示するかどうかは UI 側の判断)。
 */
export function planGenerators(
	data: RecipeData,
	totalPowerMW: Fraction,
): GeneratorRequirement[] {
	if (totalPowerMW.isNegative()) {
		throw new RangeError(
			`総電力は 0 以上で指定してください: ${totalPowerMW.toString()}`,
		);
	}

	// MW = MJ/s なので、1 分あたりに供給すべきエネルギーは総電力 × 60(MJ)
	const energyPerMinuteMJ = totalPowerMW.mul(SIXTY);

	return data.generators.map((generator) => ({
		generator: generator.id,
		count: totalPowerMW.div(Fraction.from(generator.powerMW)).ceil(),
		fuelOptions: generator.fuels.map((fuel) => ({
			fuel: {
				item: fuel.item,
				ratePerMinute: energyPerMinuteMJ.div(Fraction.from(fuel.energyMJ)),
			},
			// 副資材は燃料の種類に依らず発電量に比例する(石炭でも石油コークスでも水は同量)
			...(fuel.supplemental
				? {
						supplemental: {
							item: fuel.supplemental.item,
							ratePerMinute: energyPerMinuteMJ.mul(
								Fraction.from(fuel.supplemental.amountPerMJ),
							),
						},
					}
				: {}),
		})),
	}));
}
