import {
	DEFAULT_REMOTE_BASE_URL,
	MCP_STATE_PATH,
} from "./constants.mjs";
import { readJsonFile, writeJsonFile } from "./files.mjs";

export async function readAgentreacherState() {
	return readJsonFile(MCP_STATE_PATH, {});
}

export async function writeAgentreacherState(state) {
	await writeJsonFile(MCP_STATE_PATH, state);
}

export async function updateAgentreacherState(patch) {
	const state = await readAgentreacherState();
	const nextState = {
		...state,
		...patch,
	};
	await writeAgentreacherState(nextState);
	return nextState;
}

export function resolveApiKeyValue({
	envApiKey = process.env.AGENTREACHER_API_KEY,
	explicitApiKey,
	stateApiKey,
} = {}) {
	return explicitApiKey || envApiKey || stateApiKey || undefined;
}

export function resolveBaseUrlValue({
	defaultBaseUrl = DEFAULT_REMOTE_BASE_URL,
	envBaseUrl = process.env.AGENTREACHER_BASE_URL,
	explicitBaseUrl,
	stateBaseUrl,
} = {}) {
	return explicitBaseUrl || envBaseUrl || stateBaseUrl || defaultBaseUrl;
}

export async function resolveApiKey(options = {}) {
	const state = await readAgentreacherState();
	return resolveApiKeyValue({
		explicitApiKey: options.apiKey,
		stateApiKey: state?.apiKey,
	});
}

export async function resolveBaseUrl(options = {}) {
	const state = await readAgentreacherState();
	return resolveBaseUrlValue({
		defaultBaseUrl: options.defaultBaseUrl,
		explicitBaseUrl: options.baseUrl,
		stateBaseUrl: state?.baseUrl,
	});
}

export function maskSecret(value) {
	if (!value) return null;
	if (value.length <= 12) return "configured";
	return `${value.slice(0, 10)}...${value.slice(-4)}`;
}
