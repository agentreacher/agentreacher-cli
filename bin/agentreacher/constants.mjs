import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REMOTE_BASE_URL = "https://agentreacher.com";
export const DEFAULT_LOCAL_BASE_URL = "http://localhost:3000";
export const AGENTREACHER_SERVER_NAME = "agentreacher";
export const MCP_STATE_PATH = path.join(
	homedir(),
	".config",
	"agentreacher",
	"mcp-state.json",
);
export const MCP_SPEC_PATH = fileURLToPath(
	new URL("../../src/lib/agent-mcp-spec.json", import.meta.url),
);
export const PACKAGE_JSON_PATH = fileURLToPath(
	new URL("../../package.json", import.meta.url),
);
export const BIN_PATH = fileURLToPath(
	new URL("../agentreacher.mjs", import.meta.url),
);
export const WAIT_INTERVAL_MS = 5_000;
export const WAIT_TIMEOUT_MS = 120_000;

function readPackageVersion() {
	try {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
		return packageJson.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

export const PACKAGE_VERSION = readPackageVersion();
export const USER_AGENT = `agentreacher-cli/${PACKAGE_VERSION}`;
