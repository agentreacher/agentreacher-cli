import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import {
	AGENTREACHER_SERVER_NAME,
	DEFAULT_REMOTE_BASE_URL,
} from "./constants.mjs";
import { deviceAuthFlow } from "./auth.mjs";
import { readJsonFile, writeJsonFile } from "./files.mjs";
import {
	readAgentreacherState,
	updateAgentreacherState,
	writeAgentreacherState,
} from "./state.mjs";

export const AI_CLIENTS = [
	{ key: "claude-code", name: "Claude Code" },
	{ key: "claude-desktop", name: "Claude Desktop" },
	{ key: "cursor", name: "Cursor" },
	{ key: "windsurf", name: "Windsurf" },
	{ key: "codex", name: "Codex CLI" },
];

export function getClaudeConfigPath() {
	const homeDirectory = homedir();

	if (process.platform === "darwin") {
		return path.join(
			homeDirectory,
			"Library",
			"Application Support",
			"Claude",
			"claude_desktop_config.json",
		);
	}

	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(homeDirectory, "AppData", "Roaming");
		return path.join(appData, "Claude", "claude_desktop_config.json");
	}

	return path.join(
		homeDirectory,
		".config",
		"Claude",
		"claude_desktop_config.json",
	);
}

async function writeMcpConfig(configPath, serverName, serverConfig) {
	const existingConfig = await readJsonFile(configPath, { mcpServers: {} });
	const nextConfig = {
		...existingConfig,
		mcpServers: {
			...(existingConfig?.mcpServers ?? {}),
			[serverName]: serverConfig,
		},
	};

	await mkdir(path.dirname(configPath), { recursive: true });
	await writeJsonFile(configPath, nextConfig);
}

async function removeMcpConfig(configPath, serverName) {
	const existingConfig = await readJsonFile(configPath, null);
	if (!existingConfig?.mcpServers?.[serverName]) return false;

	const { [serverName]: _removed, ...remainingServers } =
		existingConfig.mcpServers;
	const nextConfig = { ...existingConfig, mcpServers: remainingServers };
	await writeJsonFile(configPath, nextConfig);
	return true;
}

function getBearerToken(authorizationHeader) {
	if (typeof authorizationHeader !== "string") return undefined;
	const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
	return match?.[1];
}

export function getHostedMcpUrl(baseUrl) {
	return new URL("/mcp", baseUrl).toString();
}

export async function resolveServerConfig(options = {}) {
	const mcpConfigPath = `${process.cwd()}/.mcp.json`;
	const existingConfig = await readJsonFile(mcpConfigPath, { mcpServers: {} });
	const claudeConfigPath = getClaudeConfigPath();
	const existingClaudeConfig = await readJsonFile(claudeConfigPath, {
		mcpServers: {},
	});
	const existingServerConfig =
		existingConfig?.mcpServers?.[AGENTREACHER_SERVER_NAME] ??
		existingClaudeConfig?.mcpServers?.[AGENTREACHER_SERVER_NAME] ??
		{};
	const baseUrl =
		options.baseUrl ||
		process.env.AGENTREACHER_BASE_URL ||
		existingServerConfig?.env?.AGENTREACHER_BASE_URL ||
		existingServerConfig?.url?.replace(/\/mcp\/?$/, "") ||
		DEFAULT_REMOTE_BASE_URL;
	const configuredApiKey =
		options.apiKey ||
		process.env.AGENTREACHER_API_KEY ||
		existingServerConfig?.env?.AGENTREACHER_API_KEY ||
		getBearerToken(existingServerConfig?.headers?.Authorization) ||
		"paste-your-agentreacher-api-key-here";

	const serverConfig = {
		headers: {
			Authorization: `Bearer ${configuredApiKey}`,
		},
		type: "http",
		url: getHostedMcpUrl(baseUrl),
	};

	return {
		claudeConfigPath,
		mcpConfigPath,
		serverConfig,
		tokenWasInjected:
			configuredApiKey !== "paste-your-agentreacher-api-key-here",
	};
}

function promptSelect(label, items) {
	if (!process.stdin.isTTY) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stderr,
		});
		process.stderr.write(`${label}\n`);
		for (let index = 0; index < items.length; index += 1) {
			process.stderr.write(`  ${index + 1}) ${items[index].name}\n`);
		}
		return new Promise((resolve) => {
			rl.question("Enter number: ", (answer) => {
				rl.close();
				const index = Number.parseInt(answer.trim(), 10) - 1;
				resolve(items[index >= 0 && index < items.length ? index : 0].key);
			});
		});
	}

	return new Promise((resolve) => {
		let selected = 0;

		function render() {
			if (render.drawn) {
				process.stderr.write(`\x1b[${items.length}A`);
			}
			for (let index = 0; index < items.length; index += 1) {
				const isSelected = index === selected;
				const prefix = isSelected ? "\x1b[36m>\x1b[0m" : " ";
				const text = isSelected
					? `\x1b[36m${items[index].name}\x1b[0m`
					: items[index].name;
				process.stderr.write(`\x1b[2K${prefix} ${text}\n`);
			}
			render.drawn = true;
		}

		process.stderr.write(`${label}\n`);
		render();

		process.stdin.setRawMode(true);
		process.stdin.resume();

		function cleanup() {
			process.stdin.removeListener("data", onData);
			process.stdin.setRawMode(false);
			process.stdin.pause();
		}

		function onData(buf) {
			const key = buf.toString();

			if (key === "\x1b[A" || key === "k") {
				selected = (selected - 1 + items.length) % items.length;
				render();
				return;
			}
			if (key === "\x1b[B" || key === "j") {
				selected = (selected + 1) % items.length;
				render();
				return;
			}
			if (key === "\r" || key === "\n") {
				cleanup();
				resolve(items[selected].key);
				return;
			}
			if (key === "\x03" || key === "q") {
				cleanup();
				process.exit(130);
			}
		}

		process.stdin.on("data", onData);
	});
}

async function promptClient() {
	return promptSelect("\nWhich AI client do you use?", AI_CLIENTS);
}

async function installForClient(client, serverConfig) {
	const configJson = JSON.stringify(serverConfig);

	switch (client) {
		case "claude-code": {
			execFileSync(
				"claude",
				["mcp", "add-json", AGENTREACHER_SERVER_NAME, configJson],
				{ stdio: "pipe" },
			);
			process.stderr.write("Registered with Claude Code\n");
			break;
		}
		case "claude-desktop": {
			const configPath = getClaudeConfigPath();
			await writeMcpConfig(
				configPath,
				AGENTREACHER_SERVER_NAME,
				serverConfig,
			);
			process.stderr.write(`Updated ${configPath}\n`);
			break;
		}
		case "cursor": {
			const cursorConfigPath = `${homedir()}/.cursor/mcp.json`;
			await writeMcpConfig(
				cursorConfigPath,
				AGENTREACHER_SERVER_NAME,
				serverConfig,
			);
			process.stderr.write(`Updated ${cursorConfigPath}\n`);
			break;
		}
		case "windsurf": {
			const windsurfConfigPath = `${homedir()}/.codeium/windsurf/mcp_config.json`;
			await writeMcpConfig(
				windsurfConfigPath,
				AGENTREACHER_SERVER_NAME,
				serverConfig,
			);
			process.stderr.write(`Updated ${windsurfConfigPath}\n`);
			break;
		}
		case "codex": {
			const codexConfigPath = `${process.cwd()}/.mcp.json`;
			await writeMcpConfig(
				codexConfigPath,
				AGENTREACHER_SERVER_NAME,
				serverConfig,
			);
			process.stderr.write(`Updated ${codexConfigPath}\n`);
			break;
		}
		default:
			throw new Error(`Unknown MCP client: ${client}`);
	}
}

async function removeFromClaudeCode(serverName) {
	try {
		execFileSync("claude", ["mcp", "remove", serverName], { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export async function runMcpInit(options = {}) {
	if (!options.apiKey && !process.env.AGENTREACHER_API_KEY) {
		try {
			options.apiKey = await deviceAuthFlow(options);
		} catch (error) {
			process.stderr.write(
				`${error instanceof Error ? error.message : "Authentication failed"}\n`,
			);
			process.exit(1);
		}
	}

	const { serverConfig } = await resolveServerConfig(options);
	const apiKey = getBearerToken(serverConfig?.headers?.Authorization);
	if (apiKey) {
		const state = await readAgentreacherState();
		await updateAgentreacherState({
			...state,
			apiKey,
			baseUrl: serverConfig.url.replace(/\/mcp\/?$/, ""),
		});
	}

	const client = await promptClient();
	await installForClient(client, serverConfig);

	const clientName = AI_CLIENTS.find((entry) => entry.key === client)?.name ?? client;
	process.stderr.write(
		`\nAgentReacher MCP is now available in ${clientName}. Happy automating!\n`,
	);
}

export async function runMcpConfigJson(options = {}) {
	if (!options.apiKey && !process.env.AGENTREACHER_API_KEY) {
		try {
			options.apiKey = await deviceAuthFlow(options);
		} catch (error) {
			process.stderr.write(
				`${error instanceof Error ? error.message : "Authentication failed"}\n`,
			);
			process.exit(1);
		}
	}

	const { serverConfig } = await resolveServerConfig(options);
	process.stdout.write(`${JSON.stringify(serverConfig)}\n`);
}

export async function runMcpReset() {
	const configPaths = [
		`${process.cwd()}/.mcp.json`,
		getClaudeConfigPath(),
		`${homedir()}/.cursor/mcp.json`,
		`${homedir()}/.codeium/windsurf/mcp_config.json`,
	];

	let removed = false;
	for (const configPath of configPaths) {
		if (await removeMcpConfig(configPath, AGENTREACHER_SERVER_NAME)) {
			process.stderr.write(`Removed from ${configPath}\n`);
			removed = true;
		}
	}
	if (await removeFromClaudeCode(AGENTREACHER_SERVER_NAME)) {
		process.stderr.write("Removed from Claude Code\n");
		removed = true;
	}
	await writeAgentreacherState({});

	if (!removed) {
		process.stderr.write("No AgentReacher config found to remove.\n");
	} else {
		process.stderr.write(
			"AgentReacher has been reset. Run 'npx agentreacher@latest init' to set up again.\n",
		);
	}
}
