#!/usr/bin/env node

import { runCli } from "./agentreacher/cli.mjs";

runCli(process.argv.slice(2)).catch((error) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : "Unexpected error"}\n`,
	);
	process.exit(1);
});
