import { execFileSync } from "node:child_process";
import {
	DEFAULT_REMOTE_BASE_URL,
	USER_AGENT,
} from "./constants.mjs";
import {
	readAgentreacherState,
	resolveApiKey,
	resolveBaseUrl,
	updateAgentreacherState,
} from "./state.mjs";

function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function openBrowser(url) {
	try {
		if (process.platform === "darwin") {
			execFileSync("open", [url], { stdio: "ignore" });
		} else if (process.platform === "win32") {
			execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
		} else {
			execFileSync("xdg-open", [url], { stdio: "ignore" });
		}
	} catch {
		process.stderr.write(`Open this URL in your browser: ${url}\n`);
	}
}

async function requestDeviceCode(baseUrl) {
	const response = await fetch(new URL("/api/mcp/device-code", baseUrl), {
		body: "{}",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"User-Agent": USER_AGENT,
		},
		method: "POST",
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			payload && typeof payload.error === "string"
				? payload.error
				: "Failed to start authentication";
		throw new Error(message);
	}

	return payload;
}

async function pollDeviceCode(baseUrl, code) {
	const maxAttempts = 100;
	const pollInterval = 3_000;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		await wait(pollInterval);

		const response = await fetch(new URL("/api/mcp/device-poll", baseUrl), {
			body: JSON.stringify({ code }),
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			method: "POST",
		});

		const payload = await response.json().catch(() => null);
		if (!response.ok) continue;

		if (payload.status === "authorized") {
			return payload.apiKey;
		}

		if (payload.status === "expired") {
			throw new Error("Authentication expired. Please run the command again.");
		}
	}

	throw new Error("Authentication timed out. Please run the command again.");
}

export async function deviceAuthFlow(options = {}) {
	const baseUrl = await resolveBaseUrl({
		baseUrl: options.baseUrl,
		defaultBaseUrl: DEFAULT_REMOTE_BASE_URL,
	});
	const { code, verifyUrl } = await requestDeviceCode(baseUrl);

	process.stderr.write("Opening browser to authenticate...\n");
	openBrowser(verifyUrl);
	process.stderr.write(
		`If the browser didn't open, visit: ${verifyUrl}\n\nWaiting for authentication... (press Ctrl+C to cancel)\n`,
	);

	const apiKey = await pollDeviceCode(baseUrl, code);
	process.stderr.write("Authenticated successfully!\n");
	return apiKey;
}

export async function saveApiKey(apiKey, options = {}) {
	const baseUrl = await resolveBaseUrl({
		baseUrl: options.baseUrl,
		defaultBaseUrl: DEFAULT_REMOTE_BASE_URL,
	});
	return updateAgentreacherState({ apiKey, baseUrl });
}

export async function getApiKey(options = {}) {
	const apiKey = await resolveApiKey(options);
	if (apiKey) return apiKey;

	process.stderr.write("No API key found. Starting authentication...\n");
	const newApiKey = await deviceAuthFlow(options);
	await saveApiKey(newApiKey, options);
	process.stderr.write("API key saved for future sessions.\n");
	return newApiKey;
}

export async function getAuthStatus(options = {}) {
	const state = await readAgentreacherState();
	return {
		baseUrl: await resolveBaseUrl(options),
		envApiKeyConfigured: Boolean(process.env.AGENTREACHER_API_KEY),
		stateApiKeyConfigured: Boolean(state?.apiKey),
		statePathConfigured: Boolean(state && Object.keys(state).length > 0),
	};
}
