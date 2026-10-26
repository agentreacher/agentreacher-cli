import { readFile } from "node:fs/promises";
import { ACTION_NAMES, runAction } from "./actions.mjs";
import { deviceAuthFlow, getAuthStatus, saveApiKey } from "./auth.mjs";
import {
	runMcpConfigJson,
	runMcpInit,
	runMcpReset,
} from "./config.mjs";
import {
	maskSecret,
	readAgentreacherState,
	resolveBaseUrl,
	writeAgentreacherState,
} from "./state.mjs";
import { PACKAGE_VERSION } from "./constants.mjs";

export function usage() {
	return [
		"Usage:",
		"  agentreacher init [--api-key <key>] [--base-url <url>]",
		"  agentreacher reset",
		"  agentreacher mcp init [--api-key <key>] [--base-url <url>]",
		"  agentreacher mcp config-json [--api-key <key>] [--base-url <url>]",
		"  agentreacher mcp reset",
		"  agentreacher auth login [--api-key <key>] [--base-url <url>]",
		"  agentreacher auth status [--json|--pretty]",
		"  agentreacher auth logout",
		"  agentreacher actions",
		"  agentreacher run <action> [--input <json|@file>]",
		"",
		"Global options:",
		"  --json                    Print compact JSON",
		"  --pretty                  Print pretty JSON",
		"  --api-key <key>           Use this API key for the command",
		"  --base-url <url>          Use this AgentReacher API base URL",
		"  --input <json|@file>       Action input as JSON or a JSON file",
		"  --version                 Print the CLI version",
	].join("\n");
}

function toCamelCase(flag) {
	return flag.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function setOption(options, key, value) {
	if (options[key] === undefined) {
		options[key] = value;
		return;
	}
	if (Array.isArray(options[key])) {
		options[key].push(value);
		return;
	}
	options[key] = [options[key], value];
}

export function parseCliOptions(argv) {
	const options = {};
	const positionals = [];

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--") {
			positionals.push(...argv.slice(index + 1));
			break;
		}

		if (argument === "-h" || argument === "--help") {
			options.help = true;
			continue;
		}

		if (
			argument === "--json" ||
			argument === "--pretty" ||
			argument === "--version"
		) {
			options[argument.slice(2)] = true;
			continue;
		}

		if (argument.startsWith("--")) {
			const equalsIndex = argument.indexOf("=");
			const rawKey =
				equalsIndex === -1
					? argument.slice(2)
					: argument.slice(2, equalsIndex);
			const key = toCamelCase(rawKey);
			const value =
				equalsIndex === -1 ? argv[index + 1] : argument.slice(equalsIndex + 1);
			if (equalsIndex === -1) index += 1;
			setOption(options, key, value);
			continue;
		}

		positionals.push(argument);
	}

	return { options, positionals };
}

function firstOption(value) {
	return Array.isArray(value) ? value[value.length - 1] : value;
}

export function resolveCliCommand(argv) {
	const { options, positionals } = parseCliOptions(argv);
	const [group, command] = positionals;

	if (options.version) return { kind: "version", options, positionals };
	if (options.help || !group) {
		return { kind: "help", options, positionals };
	}

	if (group === "init") return { kind: "mcp-init", options, positionals };
	if (group === "config-json") {
		return { kind: "mcp-config-json", options, positionals };
	}
	if (group === "reset") return { kind: "mcp-reset", options, positionals };
	if (group === "actions") return { kind: "actions-list", options, positionals };
	if (group === "run" && command) {
		return { actionName: command, kind: "action-run", options, positionals };
	}

	if (group === "mcp") {
		if (command === "init") return { kind: "mcp-init", options, positionals };
		if (command === "config-json") {
			return { kind: "mcp-config-json", options, positionals };
		}
		if (command === "reset") return { kind: "mcp-reset", options, positionals };
	}

	if (group === "auth") {
		if (command === "login") return { kind: "auth-login", options, positionals };
		if (command === "status") {
			return { kind: "auth-status", options, positionals };
		}
		if (command === "logout") {
			return { kind: "auth-logout", options, positionals };
		}
	}

	throw new Error(`Unknown command: ${positionals.join(" ")}`);
}

async function parseActionInput(value) {
	if (!value) return {};
	const source = value.startsWith("@")
		? await readFile(value.slice(1), "utf8")
		: value;
	const parsed = JSON.parse(source);
	if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
		throw new Error("--input must contain a JSON object");
	}
	return parsed;
}

export function getOutputMode(options = {}, stdoutIsTty = process.stdout.isTTY) {
	if (options.pretty) return "pretty";
	if (options.json || !stdoutIsTty) return "json";
	return "human";
}

function formatHuman(value) {
	if (value === undefined || value === null) return "";
	if (typeof value !== "object") return String(value);
	if (value.loggedOut) return "Logged out.";
	if (value.apiKeyConfigured !== undefined) {
		return [
			`API key: ${value.apiKeyConfigured ? "configured" : "not configured"}`,
			`Base URL: ${value.baseUrl}`,
		].join("\n");
	}
	return JSON.stringify(value, null, 2);
}

export function formatCliOutput(value, options = {}, stdoutIsTty = process.stdout.isTTY) {
	const mode = getOutputMode(options, stdoutIsTty);
	if (mode === "pretty") return `${JSON.stringify(value, null, 2)}\n`;
	if (mode === "json") return `${JSON.stringify(value)}\n`;
	const formatted = formatHuman(value);
	return formatted ? `${formatted}\n` : "";
}

async function runAuthLogin(options) {
	const apiKey = firstOption(options.apiKey) || (await deviceAuthFlow(options));
	await saveApiKey(apiKey, { baseUrl: firstOption(options.baseUrl) });
	return {
		apiKeyConfigured: true,
		apiKeyPreview: maskSecret(apiKey),
		baseUrl: await resolveBaseUrl({ baseUrl: firstOption(options.baseUrl) }),
	};
}

async function runAuthStatus(options) {
	const state = await readAgentreacherState();
	const status = await getAuthStatus({ baseUrl: firstOption(options.baseUrl) });
	return {
		apiKeyConfigured:
			status.envApiKeyConfigured || status.stateApiKeyConfigured,
		apiKeyPreview: maskSecret(process.env.AGENTREACHER_API_KEY || state?.apiKey),
		baseUrl: status.baseUrl,
		envApiKeyConfigured: status.envApiKeyConfigured,
		stateApiKeyConfigured: status.stateApiKeyConfigured,
	};
}

export async function runCli(argv = process.argv.slice(2)) {
	const invocation = resolveCliCommand(argv);
	if (invocation.kind === "version") {
		process.stdout.write(`${PACKAGE_VERSION}\n`);
		return;
	}

	if (invocation.kind === "help") {
		process.stdout.write(`${usage()}\n`);
		return;
	}

	if (invocation.kind === "mcp-init") {
		await runMcpInit({
			apiKey: firstOption(invocation.options.apiKey),
			baseUrl: firstOption(invocation.options.baseUrl),
		});
		return;
	}
	if (invocation.kind === "mcp-config-json") {
		await runMcpConfigJson({
			apiKey: firstOption(invocation.options.apiKey),
			baseUrl: firstOption(invocation.options.baseUrl),
		});
		return;
	}
	if (invocation.kind === "mcp-reset") {
		await runMcpReset();
		return;
	}
	if (invocation.kind === "actions-list") {
		process.stdout.write(
			formatCliOutput({ actions: ACTION_NAMES }, invocation.options),
		);
		return;
	}
	if (invocation.kind === "action-run") {
		const result = await runAction(
			invocation.actionName,
			await parseActionInput(firstOption(invocation.options.input)),
			{
				apiKey: firstOption(invocation.options.apiKey),
				baseUrl: firstOption(invocation.options.baseUrl),
			},
		);
		process.stdout.write(formatCliOutput(result, invocation.options));
		return;
	}

	let result;
	if (invocation.kind === "auth-login") {
		result = await runAuthLogin(invocation.options);
	} else if (invocation.kind === "auth-status") {
		result = await runAuthStatus(invocation.options);
	} else if (invocation.kind === "auth-logout") {
		await writeAgentreacherState({});
		result = { loggedOut: true };
	} else {
		throw new Error(`Unhandled command kind: ${invocation.kind}`);
	}

	process.stdout.write(formatCliOutput(result, invocation.options));
}
