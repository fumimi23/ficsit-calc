// ゲーム同梱 Docs(CommunityResources/Docs/<ロケール>.json)を RecipeData に変換する。
// 既存 npm の satisfactory-docs-parser を使わないのは、ゲーム 1.0 以降への対応が
// 未確認でテストも無いため。
//
// 含めないものの判断:
// - 可変電力の機械(粒子加速器等)とそのレシピ: 消費電力がレシピごとに変わり、機械単位の
//   定格 powerMW では表せない。誤った電力を出すより v1 では丸ごと対象外にする
// - 液体・気体の数量: Docs はリットル表記だがゲーム内 UI・既存ツールは m³ なので ÷1000 する
// - 地熱発電機(FGBuildableGeneratorGeoThermal): 出力が間欠泉の純度に依存し、定格 1 つで
//   表せない。発電機の NativeClass を列挙で持つことで自然に対象外になる
// - 資源井の抽出機・加圧機(FGBuildableFrackingExtractor / FGBuildableFrackingActivator):
//   採取レートがサテライト数と加圧機の立地に依存し、地熱発電機と同じく定格 1 つで表せない。
//   資源(水・原油)で除外すると揚水ポンプまで落ちるので、採取設備も NativeClass の列挙で持つ
import { Fraction } from "../calc/fraction";
import type {
	BuildingDef,
	ExactNumeric,
	ExtractorDef,
	GeneratorDef,
	GeneratorFuelDef,
	ItemDef,
	RecipeData,
	RecipeDef,
	RecipeIngredient,
} from "../calc/types";

/** 燃料を燃やして定格出力を出す発電機の NativeClass(suffix 一致。地熱は含めない) */
const GENERATOR_NATIVE_CLASSES = [
	".FGBuildableGeneratorFuel'",
	".FGBuildableGeneratorNuclear'",
];

/** 定格レートで採取する設備の NativeClass(suffix 一致。資源井の 2 種は含めない) */
const EXTRACTOR_NATIVE_CLASSES = [
	".FGBuildableWaterPump'",
	".FGBuildableResourceExtractor'",
];

/** 採取できる資源を形態から引くための descriptor の NativeClass(suffix 一致) */
const RESOURCE_DESCRIPTOR_NATIVE_CLASS = ".FGResourceDescriptor'";

/** 建設レシピ(Build Gun で建てるレシピ)の mProducedIn に現れるクラス */
const BUILD_GUN_CLASS = "BP_BuildGun_C";

/**
 * 出力順を安定させる比較関数(生成のたびに diff が出ないように)。
 * localeCompare は使わない(ICU/ロケール依存で環境により並びが変わりうるため)
 */
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** UTF-16LE(BOM 付き)の Docs ファイルを文字列に復号する */
export function decodeDocs(buffer: Uint8Array): string {
	// BOM の手動除去はしない(TextDecoder が既定で取り除く)
	return new TextDecoder("utf-16le").decode(buffer);
}

/**
 * Docs の中身(復号済みテキスト)を RecipeData に変換する。
 * - enText: en-US.json(構造・数値・英語名の正本)
 * - jaText: ja.json(日本語表示名のみ利用)。省略時は nameJa なし
 */
export function parseDocs(enText: string, jaText?: string): RecipeData {
	const groups = parseGroups(enText);
	const jaNames = jaText ? buildDisplayNameIndex(parseGroups(jaText)) : null;

	// Descriptor 系の NativeClass は列挙しない(核燃料・バイオマス等に散らばっていて、
	// ゲーム更新で増える。全グループを索引してレシピが参照した ClassName から引くほうが壊れない)
	const descriptors = new Map<string, Descriptor>();
	for (const group of groups) {
		for (const entry of group.Classes) {
			const name = asString(entry.mDisplayName);
			if (!name) continue;
			descriptors.set(entry.ClassName, {
				name,
				form: parseForm(asString(entry.mForm)),
				// 燃料のエネルギー(固体 = MJ/個、液体・気体 = MJ/L)。発電機の計算に使う
				energyValue: asString(entry.mEnergyValue),
			});
		}
	}

	// 参照されたアイテムはレシピ・発電機・建設素材から集める(items はこの集合から作る)
	const referencedItems = new Set<string>();

	// 建設レシピは製造レシピとは別枠。product の ClassName で索引しておき、
	// 機械・発電機の側から引く(recipes には入れない: Build Gun で建てるものであって
	// 生産チェーンの候補ではない)
	const constructionRecipes = new Map<string, DocsEntry[]>();
	for (const group of groups) {
		if (!group.NativeClass.endsWith(".FGRecipe'")) continue;
		for (const entry of group.Classes) {
			// 期間限定イベント(FICSMAS 等)の建設物は通常プレイで建てられない
			if (asString(entry.mRelevantEvents)) continue;
			const producedIn = parseClassNameList(asString(entry.mProducedIn) ?? "");
			if (!producedIn.includes(BUILD_GUN_CLASS)) continue;
			for (const { item } of parseItemAmounts(asString(entry.mProduct) ?? "")) {
				const sameProduct = constructionRecipes.get(item) ?? [];
				sameProduct.push(entry);
				constructionRecipes.set(item, sameProduct);
			}
		}
	}

	/**
	 * Build_X_C 1 台分の建設素材。対応付けは product(Desc_X_C)で行う。
	 * レシピ ClassName の規約で引いてはいけない: 鋳造炉の建設レシピが Recipe_SmelterMk1_C で、
	 * 製錬炉(Recipe_SmelterBasicMk1_C)のものと取り違える
	 */
	const constructionCostOf = (buildableId: string): RecipeIngredient[] => {
		const productClass = buildableId.replace(/^Build_/, "Desc_");
		const found = constructionRecipes.get(productClass) ?? [];
		// 0 件なら建設コストが欠落し、複数件ならどれが正か決められない。
		// どちらも黙って通すと建設コストが静かに間違う
		if (found.length !== 1) {
			throw new Error(
				`建設レシピが 1 件に定まりません(${found.length} 件): ${buildableId}`,
			);
		}
		return parseItemAmounts(asString(found[0]?.mIngredients) ?? "").map(
			({ item, amount }) => {
				referencedItems.add(item);
				return { item, amount: convertAmount(item, amount, descriptors) };
			},
		);
	};

	const buildings = new Map<string, BuildingDef>();
	for (const group of groups) {
		// endsWith の末尾クォートまで含めた一致により、FGBuildableManufacturerVariablePower
		// (可変電力)はここに入らない
		if (!group.NativeClass.endsWith(".FGBuildableManufacturer'")) continue;
		for (const entry of group.Classes) {
			buildings.set(entry.ClassName, {
				name: requireString(
					entry.mDisplayName,
					`${entry.ClassName}.mDisplayName`,
				),
				...jaName(jaNames, entry.ClassName),
				powerMW: parseDecimal(
					requireString(
						entry.mPowerConsumption,
						`${entry.ClassName}.mPowerConsumption`,
					),
				),
				constructionCost: constructionCostOf(entry.ClassName),
			});
		}
	}

	const recipes: RecipeDef[] = [];
	for (const group of groups) {
		if (!group.NativeClass.endsWith(".FGRecipe'")) continue;
		for (const entry of group.Classes) {
			const id = entry.ClassName;
			const name = requireString(entry.mDisplayName, `${id}.mDisplayName`);

			// ClassName 規約(Recipe_Alternate_*)では判定しない。ゲーム 1.0 でデフォルト化した
			// のに旧クラス名が残るレシピ(Recipe_Alternate_Turbofuel_C)があり、表示名の
			// "Alternate:" プレフィックスだけがスキマティックの解禁種別と全件一致するため
			const alternate = name.startsWith("Alternate:");

			// 期間限定イベント(FICSMAS 等)のレシピは通常プレイで使えないため収録しない
			if (asString(entry.mRelevantEvents)) {
				continue;
			}

			const producedIn = parseClassNameList(asString(entry.mProducedIn) ?? "");
			const building = producedIn.find((b) => buildings.has(b));
			if (!building) continue;

			const toIngredients = (field: string): RecipeIngredient[] =>
				parseItemAmounts(asString(entry[field]) ?? "").map(
					({ item, amount }) => {
						referencedItems.add(item);
						return { item, amount: convertAmount(item, amount, descriptors) };
					},
				);

			recipes.push({
				id,
				name,
				...jaName(jaNames, id),
				building,
				durationSeconds: parseDecimal(
					requireString(
						entry.mManufactoringDuration,
						`${id}.mManufactoringDuration`,
					),
				),
				alternate,
				inputs: toIngredients("mIngredients"),
				outputs: toIngredients("mProduct"),
			});
		}
	}

	// 発電機はレシピより後に読む(燃料・副資材を referencedItems へ足してから items を作るため)。
	// 燃料をレシピ経由でしか収録しないと、可変電力機械でしか作れないフィクソニウム燃料棒の
	// 表示名が引けず参照整合性も壊れる
	const generators: GeneratorDef[] = [];
	for (const group of groups) {
		if (!GENERATOR_NATIVE_CLASSES.some((c) => group.NativeClass.endsWith(c))) {
			continue;
		}
		for (const entry of group.Classes) {
			const id = entry.ClassName;
			// 副資材の比率は発電機ごとに 1 つ(燃料別ではない)。要求しない発電機の
			// mSupplementalResourceClass は空文字なので、フラグを見てから読む
			const supplementalPerMJ =
				asString(entry.mRequiresSupplementalResource) === "True"
					? scaleByThousand(
							requireString(
								entry.mSupplementalToPowerRatio,
								`${id}.mSupplementalToPowerRatio`,
							),
							"div",
						)
					: undefined;

			const fuels = parseFuelEntries(entry.mFuel, id).map(
				({ fuelClass, supplementalClass }, i): GeneratorFuelDef => {
					referencedItems.add(fuelClass);
					if (supplementalPerMJ === undefined) {
						return {
							item: fuelClass,
							energyMJ: fuelEnergyMJ(fuelClass, descriptors),
						};
					}
					// 副資材必須なのにクラスが空、は Docs 側の不整合。黙って落とすと
					// 水需要が過少表示になるだけで気づけないので、燃料のエネルギー値と同じく大声で失敗する
					if (!supplementalClass) {
						throw new Error(
							`副資材が必須なのに副資材クラスが空です: ${id}.mFuel[${i}].mSupplementalResourceClass`,
						);
					}
					referencedItems.add(supplementalClass);
					return {
						item: fuelClass,
						energyMJ: fuelEnergyMJ(fuelClass, descriptors),
						supplemental: {
							item: supplementalClass,
							amountPerMJ: supplementalPerMJ,
						},
					};
				},
			);

			generators.push({
				id,
				name: requireString(entry.mDisplayName, `${id}.mDisplayName`),
				...jaName(jaNames, id),
				powerMW: parseDecimal(
					requireString(entry.mPowerProduction, `${id}.mPowerProduction`),
				),
				fuels,
				constructionCost: constructionCostOf(id),
			});
		}
	}

	// 資源の形態は資源 descriptor だけから引く。全 descriptor から引くと、
	// 部品(鉄板など)まで RF_SOLID の資源として採鉱機の対象に混ざる
	const resourceForms = new Map<string, ItemDef["form"]>();
	for (const group of groups) {
		if (!group.NativeClass.endsWith(RESOURCE_DESCRIPTOR_NATIVE_CLASS)) continue;
		for (const entry of group.Classes) {
			resourceForms.set(entry.ClassName, parseForm(asString(entry.mForm)));
		}
	}

	// 採取設備も発電機と同じくレシピより後・items より前に読む
	// (対象資源・建設素材を referencedItems へ足してから items を作るため)
	const extractors: ExtractorDef[] = [];
	for (const group of groups) {
		if (!EXTRACTOR_NATIVE_CLASSES.some((c) => group.NativeClass.endsWith(c))) {
			continue;
		}
		for (const entry of group.Classes) {
			const id = entry.ClassName;
			const form = parseAllowedResourceForm(entry, id);
			// 資源を限定する設備(揚水ポンプ・原油抽出機)は mAllowedResources を持つが、
			// 限定しない設備(採鉱機)では空なので、形態から資源 descriptor を展開する
			const resources = (
				asString(entry.mOnlyAllowCertainResources) === "True"
					? parseClassNameList(asString(entry.mAllowedResources) ?? "")
					: [...resourceForms]
							.filter(([, resourceForm]) => resourceForm === form)
							.map(([className]) => className)
			).sort(byKey);
			// 対象資源が引けない設備は原料に結び付けようがない。黙って空で通すと
			// 「採取設備の無い資源」と見分けが付かなくなる(Docs ドリフトの兆候)
			if (resources.length === 0) {
				throw new Error(`採取設備の対象資源が空です: ${id}`);
			}
			for (const resource of resources) referencedItems.add(resource);

			extractors.push({
				id,
				name: requireString(entry.mDisplayName, `${id}.mDisplayName`),
				...jaName(jaNames, id),
				powerMW: parseDecimal(
					requireString(entry.mPowerConsumption, `${id}.mPowerConsumption`),
				),
				ratePerMinute: extractRatePerMinute(entry, form, id),
				resources,
				constructionCost: constructionCostOf(id),
			});
		}
	}

	// 全 Descriptor は収録しない(データポリシー: 抽出は計算に必要な最小限)
	const items = new Map<string, ItemDef>();
	for (const id of referencedItems) {
		const desc = descriptors.get(id);
		if (!desc) {
			throw new Error(`参照されたアイテムの定義が見つかりません: ${id}`);
		}
		items.set(id, {
			name: desc.name,
			...jaName(jaNames, id),
			...(desc.form ? { form: desc.form } : {}),
		});
	}

	return {
		items: Object.fromEntries([...items].sort(([a], [b]) => byKey(a, b))),
		buildings: Object.fromEntries(
			[...buildings].sort(([a], [b]) => byKey(a, b)),
		),
		recipes: recipes.sort((a, b) => byKey(a.id, b.id)),
		generators: generators.sort((a, b) => byKey(a.id, b.id)),
		extractors: extractors.sort((a, b) => byKey(a.id, b.id)),
	};
}

// ---- Docs の生形式 ----

/** ClassName で引く Descriptor 側の属性(表示名・形態・燃料としてのエネルギー) */
interface Descriptor {
	name: string;
	form?: ItemDef["form"];
	/** Docs の生表記("300.000000")。単位は形態で変わるので換算は使う側で行う */
	energyValue?: string;
}

interface DocsGroup {
	NativeClass: string;
	Classes: DocsEntry[];
}

interface DocsEntry {
	ClassName: string;
	[key: string]: unknown;
}

function parseGroups(text: string): DocsGroup[] {
	const parsed: unknown = JSON.parse(text);
	if (!Array.isArray(parsed)) {
		throw new Error("Docs の形式が不正です: トップレベルが配列ではありません");
	}
	for (const group of parsed) {
		if (
			typeof group?.NativeClass !== "string" ||
			!Array.isArray(group?.Classes)
		) {
			throw new Error(
				"Docs の形式が不正です: NativeClass / Classes を持たない要素があります",
			);
		}
	}
	return parsed as DocsGroup[];
}

function buildDisplayNameIndex(groups: DocsGroup[]): Map<string, string> {
	const index = new Map<string, string>();
	for (const group of groups) {
		for (const entry of group.Classes) {
			const name = asString(entry.mDisplayName);
			if (name) index.set(entry.ClassName, name);
		}
	}
	return index;
}

/** nameJa が無いとき undefined 値を入れない(JSON.stringify で "nameJa": undefined を出さないため) */
function jaName(
	index: Map<string, string> | null,
	className: string,
): { nameJa?: string } {
	const nameJa = index?.get(className);
	return nameJa ? { nameJa } : {};
}

// "((ItemClass=\"...Desc_IronRod.Desc_IronRod_C'\",Amount=12),...)" 形式
const ITEM_AMOUNT_RE =
	/ItemClass="[^"]*\.([A-Za-z0-9_]+)'"\s*,\s*Amount=(\d+)/g;

function parseItemAmounts(text: string): { item: string; amount: number }[] {
	return [...text.matchAll(ITEM_AMOUNT_RE)].map((m) => ({
		item: m[1] as string,
		amount: Number(m[2]),
	}));
}

// mProducedIn: "(\"/Game/.../Build_AssemblerMk1.Build_AssemblerMk1_C\",...)" 形式
const CLASS_NAME_RE = /\.([A-Za-z0-9_]+_C)/g;

function parseClassNameList(text: string): string[] {
	return [...text.matchAll(CLASS_NAME_RE)].map((m) => m[1] as string);
}

/**
 * Docs の "60.000000" 形式を ExactNumeric に正規化する。
 * Number → String の最短往復表現は元の十進値を正確に保つ(Fraction.from と同じ前提)。
 */
function parseDecimal(text: string): ExactNumeric {
	const value = Number(text);
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`数値として解釈できません: ${text}`);
	}
	return value;
}

function parseForm(raw: string | undefined): ItemDef["form"] {
	switch (raw) {
		case "RF_SOLID":
			return "solid";
		case "RF_LIQUID":
			return "liquid";
		case "RF_GAS":
			return "gas";
		default:
			return undefined;
	}
}

/** 液体・気体の数量はリットル表記なので m³ に変換する(÷1000 は 3 桁までの十進で正確) */
function convertAmount(
	item: string,
	amount: number,
	descriptors: Map<string, { form?: ItemDef["form"] }>,
): number {
	const form = descriptors.get(item)?.form;
	return form === "liquid" || form === "gas" ? amount / 1000 : amount;
}

const THOUSAND = Fraction.of(1000);
const SIXTY = Fraction.of(60);

/**
 * 分数で出した換算結果を ExactNumeric(十進)に戻す。
 * float の乗除算で計算しないのは `3.6 * 1000 === 3600.0000000000005` のように
 * 十進の見た目ごと壊れるため。往復で一致しない結果は無言で丸めずエラーにする。
 */
function toExactNumeric(exact: Fraction, label: string): ExactNumeric {
	const value = Number(exact.toDecimalString(12));
	if (!Fraction.from(value).equals(exact)) {
		throw new Error(`十進で正確に表せない換算結果です: ${label}`);
	}
	return value;
}

/** 十進値を 1000 倍 / 1000 分の 1 する(L ↔ m³ の換算) */
function scaleByThousand(text: string, direction: "mul" | "div"): ExactNumeric {
	const source = Fraction.from(text);
	return toExactNumeric(
		direction === "mul" ? source.mul(THOUSAND) : source.div(THOUSAND),
		text,
	);
}

/**
 * 採取設備が採れる資源の形態。単位換算が形態で変わるので、複数形態
 * (資源井の "(RF_LIQUID,RF_GAS)")や未知の形態は黙って通さない。
 */
function parseAllowedResourceForm(
	entry: DocsEntry,
	id: string,
): NonNullable<ItemDef["form"]> {
	const raw = requireString(
		entry.mAllowedResourceForms,
		`${id}.mAllowedResourceForms`,
	);
	const names = raw
		.replace(/[()]/g, "")
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	const form = names.length === 1 ? parseForm(names[0]) : undefined;
	if (!form) {
		throw new Error(`採取設備の資源形態が 1 つに定まりません: ${id} = ${raw}`);
	}
	return form;
}

/**
 * 普通純度ノードでの採取レート(1 分あたり)。Docs は 1 サイクルの秒数と個数で持つ。
 * 液体・気体はレシピの数量と同じく L → m³ に直す(÷1000)。
 */
function extractRatePerMinute(
	entry: DocsEntry,
	form: NonNullable<ItemDef["form"]>,
	id: string,
): ExactNumeric {
	const cycleSeconds = Fraction.from(
		requireString(entry.mExtractCycleTime, `${id}.mExtractCycleTime`),
	);
	// 0 秒サイクルは無限レートになる(Docs 側の不整合の兆候)
	if (cycleSeconds.isZero() || cycleSeconds.isNegative()) {
		throw new Error(`採取のサイクル時間が正ではありません: ${id}`);
	}
	const perCycle = Fraction.from(
		requireString(entry.mItemsPerCycle, `${id}.mItemsPerCycle`),
	);
	const perMinute = perCycle.div(cycleSeconds).mul(SIXTY);
	return toExactNumeric(
		form === "liquid" || form === "gas" ? perMinute.div(THOUSAND) : perMinute,
		`${id}.mItemsPerCycle`,
	);
}

/**
 * 燃料 1 単位あたりのエネルギー(MJ)。液体・気体は Docs が MJ/L なので、
 * 数量を m³ に揃えているのに合わせて ×1000 して MJ/m³ にする。
 * 副資材(水)の mEnergyValue は 0 だが燃料としては読まないのでここには来ない。
 */
function fuelEnergyMJ(
	itemId: string,
	descriptors: Map<string, Descriptor>,
): ExactNumeric {
	const desc = descriptors.get(itemId);
	if (!desc?.energyValue) {
		throw new Error(`燃料のエネルギー値が Docs にありません: ${itemId}`);
	}
	const energy =
		desc.form === "liquid" || desc.form === "gas"
			? scaleByThousand(desc.energyValue, "mul")
			: parseDecimal(desc.energyValue);
	// 0 を通すと必要燃料が 0 除算になる(燃料でないアイテムを mFuel から拾った兆候でもある)
	const exact = Fraction.from(energy);
	if (exact.isZero() || exact.isNegative()) {
		throw new Error(`燃料のエネルギー値が正ではありません: ${itemId}`);
	}
	return energy;
}

/** mFuel は生の JSON 配列(他のフィールドと違い文字列に畳まれていない) */
function parseFuelEntries(
	value: unknown,
	id: string,
): { fuelClass: string; supplementalClass?: string }[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`発電機の燃料が空です: ${id}.mFuel`);
	}
	return value.map((raw, i) => {
		const fuel = (raw ?? {}) as Record<string, unknown>;
		return {
			fuelClass: requireString(fuel.mFuelClass, `${id}.mFuel[${i}].mFuelClass`),
			supplementalClass: asString(fuel.mSupplementalResourceClass),
		};
	});
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireString(value: unknown, label: string): string {
	const text = asString(value);
	if (text === undefined) {
		throw new Error(`Docs の必須フィールドがありません: ${label}`);
	}
	return text;
}
