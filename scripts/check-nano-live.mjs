#!/usr/bin/env node
// For Antigravity built-in browser: quick check if LanguageModel is available in this Chrome.
// Run via: pnpm nano:check:live  (will try to launch chrome with CDP if needed)
// On your M2 Max this should print "available" after first launch with flags.
try {
  // This script is expected to be run inside Chrome's DevTools console, not Node.
  // So we just print instructions if run in Node.
  console.log("[nano:live] Node check — to verify live Nano, run this in Chrome DevTools Console:");
  console.log(`  await LanguageModel.availability({expectedInputs:[{type:"text",languages:["de","en"]}], expectedOutputs:[{type:"text",languages:["de"]}]})`);
  console.log(`  // should print "available" on your M2 Max 64GB`);
  console.log(`  const s = await LanguageModel.create({expectedInputs:[{type:"text",languages:["de"]}]}); await s.prompt('Erkenne [PERSON] in: Max Müller arbeitet an Project Titan');`);
} catch {}
