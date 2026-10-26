import { USER_AGENT } from "./constants.mjs";
import { getApiKey } from "./auth.mjs";
import { resolveBaseUrl } from "./state.mjs";

export function withQuery(pathname, params = {}) {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === "") continue;
		searchParams.set(key, String(value));
	}
	const search = searchParams.toString();
	return search ? `${pathname}?${search}` : pathname;
}

export async function agentreacherRequest(pathname, options = {}) {
	const baseUrl = await resolveBaseUrl(options);
	const headers = new Headers(options.headers ?? {});
	headers.set("Accept", headers.get("Accept") ?? "application/json");
	headers.set("User-Agent", USER_AGENT);

	let body;
	if (options.rawBody !== undefined) {
		body = options.rawBody;
	} else if (options.body !== undefined) {
		body = JSON.stringify(options.body);
		headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
	}

	if (options.auth !== false) {
		headers.set("Authorization", `Bearer ${options.apiKey ?? (await getApiKey(options))}`);
	}

	const response = await fetch(new URL(pathname, baseUrl), {
		body,
		headers,
		method: options.method || "GET",
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			payload && typeof payload.error === "string"
				? payload.error
				: payload && typeof payload.message === "string"
					? payload.message
					: `AgentReacher request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload;
}
