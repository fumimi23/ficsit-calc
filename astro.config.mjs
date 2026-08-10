// @ts-check
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// GitHub Pages のプロジェクトページとして配信するため base を設定。
// 開発サーバも http://localhost:5273/ficsit-calc になる。
export default defineConfig({
	site: "https://fumimi23.github.io",
	base: "/ficsit-calc",
	integrations: [react()],
	server: { port: 5273 },
});
