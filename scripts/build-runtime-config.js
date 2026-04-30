import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve("public", "runtime-config.js");

const runtimeConfig = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
};

const fileContents = `window.__APP_CONFIG__ = Object.freeze(${JSON.stringify(
  runtimeConfig,
  null,
  2
)});\n`;

mkdirSync(resolve("public"), { recursive: true });
writeFileSync(outputPath, fileContents, "utf8");

console.log(`Wrote runtime config to ${outputPath}`);
