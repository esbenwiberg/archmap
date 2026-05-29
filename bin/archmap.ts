#!/usr/bin/env node
import { Command } from "commander";
import { scanCommand } from "../src/commands/scan.js";
import { classifyCommand } from "../src/commands/classify.js";
import { checkCommand } from "../src/commands/check.js";
import { explainCommand } from "../src/commands/explain.js";
import { riskCommand } from "../src/commands/risk.js";

const program = new Command();

program
  .name("archmap")
  .description("Classify repo files as leaf | branch | hub by dependency topology")
  .version("0.1.0")
  .option("--config <path>", "Path to .archmap.yaml (default: .archmap.yaml)");

program
  .command("scan")
  .description("Rebuild topology and write .archmap/topology.json")
  .option("--entry <path>", "Entry path override (overrides config)")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const { loadConfig } = await import("../src/config.js");
    const globalOpts = program.opts();
    const config = loadConfig(globalOpts.config);
    const entry =
      opts.entry ??
      config.analyzers.find((a) => a.lang === "typescript")?.entry ??
      "src/";
    await scanCommand(entry, opts);
  });

program
  .command("classify <file>")
  .description("Classify a single file (leaf | branch | hub)")
  .option("--json", "JSON output")
  .action(async (file, opts) => {
    const globalOpts = program.opts();
    await classifyCommand(file, { ...opts, config: globalOpts.config });
  });

program
  .command("check <files...>")
  .description("Exit non-zero if any input file is a hub (CI/hook gate)")
  .option("--json", "JSON output")
  .action(async (files, opts) => {
    const globalOpts = program.opts();
    await checkCommand(files, { ...opts, config: globalOpts.config });
  });

program
  .command("explain <file>")
  .description("List dependents and classification rationale")
  .option("--json", "JSON output")
  .action(async (file, opts) => {
    const globalOpts = program.opts();
    await explainCommand(file, { ...opts, config: globalOpts.config });
  });

program
  .command("risk")
  .description("List riskiest files by combined topology + churn score")
  .option("--top <n>", "Number of files to show (default: 10)")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const globalOpts = program.opts();
    await riskCommand({ ...opts, config: globalOpts.config });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
