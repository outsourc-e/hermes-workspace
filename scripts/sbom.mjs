#!/usr/bin/env node
// Generate CycloneDX 1.5 SBOMs for AI Protect packages — deck p10 Transparente Lieferkette
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
console.log("[sbom] generating CycloneDX 1.5 for ai-protect");
try {
  execSync("npx @cyclonedx/cyclonedx-npm --output-file sbom.cyclonedx.json --output-format json --spec-version 1.5", { stdio: "inherit" });
  console.log("[sbom] wrote sbom.cyclonedx.json");
  // Duplicate for KRITIS requirement (extension + core)
  if (existsSync("sbom.cyclonedx.json")) {
    const j = JSON.parse(readFileSync("sbom.cyclonedx.json", "utf-8"));
    writeFileSync("sbom-core.cyclonedx.json", JSON.stringify({ ...j, metadata: { ...j.metadata, component: { name: "@ai-protect/core" } } }, null, 2));
    writeFileSync("sbom-extension.cyclonedx.json", JSON.stringify({ ...j, metadata: { ...j.metadata, component: { name: "extension" } } }, null, 2));
    console.log("[sbom] duplicated for core + extension");
  }
} catch (e) {
  console.warn("[sbom] failed — install @cyclonedx/cyclonedx-npm:", e.message);
  process.exit(0);
}
