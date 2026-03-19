#!/usr/bin/env node
/**
 * Bundles individual property district JSON files into a single
 * properties-all.json file for faster loading (1 request instead of 282).
 *
 * Run automatically via the "prebuild" npm script.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join("public", "data", "properties");
const outPath = path.join("public", "data", "properties-all.json");

if (!fs.existsSync(dir)) {
  console.log("No property district files found — skipping bundle generation");
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.log("No property district files found — skipping bundle generation");
  process.exit(0);
}

const bundle = {};
for (const file of files) {
  const district = file.replace(".json", "");
  bundle[district] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
}

const json = JSON.stringify(bundle);
fs.writeFileSync(outPath, json);

const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
console.log(`Bundled ${files.length} districts into ${outPath} (${sizeMB} MB)`);
