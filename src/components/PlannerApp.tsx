// アイランドのエントリ(issue #3)。recipes.json をビルド時に同梱する。
// import した JSON は型が広がる(form が string になる)ため、validateRecipeData を型ゲートに使う。
// コミット済みデータの正当性は invariants テストが保証している
import recipesJson from "../../data/recipes.json";
import { validateRecipeData } from "../lib/calc/validate";
import { ProductionPlanner } from "./ProductionPlanner";

const data = validateRecipeData(recipesJson);

export function PlannerApp() {
	return <ProductionPlanner data={data} />;
}
