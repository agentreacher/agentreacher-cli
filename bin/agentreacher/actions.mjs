import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { WAIT_INTERVAL_MS, WAIT_TIMEOUT_MS } from "./constants.mjs";
import { agentreacherRequest, withQuery } from "./http.mjs";
import { updateAgentreacherState } from "./state.mjs";

export const PROVIDERS = [
	"bluesky",
	"instagram",
	"facebook",
	"x",
	"youtube",
	"tiktok",
	"pinterest",
	"linkedin",
	"threads",
];

export const UNIFIED_TARGETS = [
	"bluesky",
	"facebook",
	"instagram",
	"linkedin",
	"pinterest",
	"tiktok",
	"threads",
	"x",
	"youtube",
];

export const UNIFIED_TARGET_SCHEMA = z.union([
	z.enum(UNIFIED_TARGETS),
	z.object({
		channelId: z.string().min(1),
		provider: z.enum(UNIFIED_TARGETS),
	}),
]);

const PLATFORM_OVERRIDE_SCHEMA = z.object({
	boardId: z.string().min(1).optional(),
	brandContent: z.boolean().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	disableComments: z.boolean().optional(),
	disableDuet: z.boolean().optional(),
	disableStitch: z.boolean().optional(),
	igAltText: z.string().max(1000).optional(),
	igCollaborators: z.string().max(500).optional(),
	igDisableComments: z.boolean().optional(),
	igShareToFeed: z.boolean().optional(),
	mediaAssetId: z.string().min(1).optional(),
	mediaUrl: z.string().url().optional(),
	privacy: z.string().max(60).optional(),
	text: z.string().min(1).optional(),
	title: z.string().max(200).optional(),
});

const CREATE_POST_CONTENT_SCHEMA = z.object({
	brief: z.string().min(5).max(2000).optional(),
	caption: z.string().max(63206).optional(),
	prompt: z.string().max(4000).optional(),
});

const CREATE_POST_WITH_MEDIA_CONTENT_SCHEMA = z.object({
	brief: z.string().min(5).max(2000).optional(),
	caption: z.string().max(63206),
	prompt: z.string().max(4000).optional(),
});

const COMPOSE_POST_MEDIA_SCHEMA = z.object({
	assetId: z.string().optional(),
	assetIds: z.array(z.string().min(1)).optional(),
	assetUrl: z.string().url().optional(),
	aspectRatio: z.string().max(40).optional(),
	items: z
		.array(
			z.object({
				assetId: z.string().optional(),
				assetUrl: z.string().url().optional(),
				coverImageAssetId: z.string().optional(),
				coverImageUrl: z.string().url().optional(),
				mediaType: z.enum(["image", "video"]).optional(),
			}),
		)
		.optional(),
	style: z.string().max(200).optional(),
});

const MEDIA_UPLOAD_SCHEMA = z.object({
	content: z.string().min(1).optional(),
	contentType: z.string().optional(),
	filePath: z.string().min(1).optional(),
	filename: z.string().optional(),
	sourceUrl: z.string().url().optional(),
});

const PUBLISH_OPTIONS_SCHEMA = z
	.object({
		scheduledAt: z.string().datetime().optional(),
	})
	.optional();

function requestOptions(ctx) {
	return {
		apiKey: ctx?.apiKey,
		baseUrl: ctx?.baseUrl,
	};
}

function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function formatJson(value) {
	return JSON.stringify(value, null, 2);
}

export function normalizeDeliveryForMcp(delivery) {
	if (!delivery || typeof delivery !== "object") return delivery;

	const { provider, scheduledAt, ...rest } = delivery;
	return {
		...rest,
		publishOptions: {
			scheduledAt: scheduledAt ?? null,
		},
		target: provider,
	};
}

export function normalizeUnifiedPostForMcp(post) {
	if (!post || typeof post !== "object") return post;

	const {
		contentBrief,
		deliveries,
		generatedAssetUrl,
		platformOverrides,
		platforms,
		prompt,
		scheduledAt,
		...rest
	} = post;

	return {
		...rest,
		content: {
			brief: contentBrief,
			prompt: prompt ?? null,
		},
		deliveries: Array.isArray(deliveries)
			? deliveries.map(normalizeDeliveryForMcp)
			: [],
		media: {
			assetUrl: generatedAssetUrl ?? null,
		},
		overrides: platformOverrides ?? {},
		publishOptions: {
			scheduledAt: scheduledAt ?? null,
		},
		targets: platforms ?? [],
	};
}

export function normalizeUnifiedPostListForMcp(posts) {
	return Array.isArray(posts) ? posts.map(normalizeUnifiedPostForMcp) : [];
}

export function normalizeSocialChannelForAgent(channel) {
	if (!channel || typeof channel !== "object") return channel;

	const { tokenExpiresAt, ...rest } = channel;
	return rest;
}

export function normalizeSocialChannelListForAgent(channels) {
	return Array.isArray(channels)
		? channels.map(normalizeSocialChannelForAgent)
		: [];
}

export function inferContentTypeFromFilename(filename) {
	if (!filename) return "image/jpeg";
	const ext = filename.split(".").pop()?.toLowerCase();
	const map = {
		avif: "image/avif",
		gif: "image/gif",
		jpeg: "image/jpeg",
		jpg: "image/jpeg",
		mov: "video/quicktime",
		mp4: "video/mp4",
		png: "image/png",
		webp: "image/webp",
	};
	return map[ext ?? ""] ?? "image/jpeg";
}

function normalizeCreatePostContent(content) {
	const normalized = { ...(content ?? {}) };
	if (typeof normalized.caption === "string" && typeof normalized.brief !== "string") {
		normalized.brief = normalized.caption;
	}
	return normalized;
}

async function deleteUploadedMediaAsset(assetId, ctx) {
	if (!assetId) return;
	try {
		await agentreacherRequest(`/api/social/media/${encodeURIComponent(assetId)}`, {
			...requestOptions(ctx),
			method: "DELETE",
		});
	} catch {
		// Best-effort cleanup only; preserve the original post creation error.
	}
}

async function uploadLocalFile(filePath, args, ctx) {
	const fileStats = await stat(filePath);
	const filename = args.filename || basename(filePath);
	const contentType =
		args.contentType || inferContentTypeFromFilename(filename);
	const buffer = await readFile(filePath);
	const formData = new FormData();
	formData.append(
		"file",
		new Blob([buffer], { type: contentType }),
		filename,
	);

	return agentreacherRequest("/api/social/upload-media", {
		...requestOptions(ctx),
		headers: {
			"X-AgentReacher-File-Size": String(fileStats.size),
		},
		method: "POST",
		rawBody: formData,
	});
}

async function uploadMediaFromArgs(args, ctx) {
	if (args.filePath) {
		return uploadLocalFile(args.filePath, args, ctx);
	}

	return agentreacherRequest("/api/social/upload-media", {
		...requestOptions(ctx),
		body: {
			content: args.content,
			contentType: args.contentType,
			filename: args.filename,
			sourceUrl: args.sourceUrl,
		},
		method: "POST",
	});
}

async function waitForUnifiedPost(postId, ctx) {
	const startedAt = Date.now();
	let post = null;

	while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
		const payload = await agentreacherRequest(`/api/social/posts/${postId}`, {
			...requestOptions(ctx),
		});
		post = payload.post ?? null;

		if (!post || post.status !== "processing") {
			return post;
		}

		await wait(WAIT_INTERVAL_MS);
	}

	return post;
}

async function persistWorkspaceApiKey(payload, fallbackWorkspaceId) {
	if (!payload?.apiKey) return;
	await updateAgentreacherState({
		apiKey: payload.apiKey,
		workspaceId: payload.workspace?.id ?? fallbackWorkspaceId ?? null,
	});
}

const providerConnectionPaths = {
	bluesky: "/api/social/bluesky/connection",
	facebook: "/api/social/facebook/connection",
	instagram: "/api/social/instagram/connection",
	linkedin: "/api/social/linkedin/connection",
	pinterest: "/api/social/pinterest/connection",
	threads: "/api/social/threads/connection",
	tiktok: "/api/social/tiktok/connection",
	x: "/api/social/x/connection",
	youtube: "/api/social/youtube/connection",
};

const providerOauthStartPaths = {
	facebook: "/api/social/facebook/oauth/start",
	instagram: "/api/social/instagram/oauth/start?provider=instagram",
	linkedin: "/api/social/linkedin/oauth/start",
	pinterest: "/api/social/pinterest/oauth/start",
	threads: "/api/social/threads/oauth/start",
	tiktok: "/api/social/tiktok/oauth/start",
	x: "/api/social/x/oauth/start",
	youtube: "/api/social/youtube/oauth/start",
};

const POST_SCHEDULE_SCHEMA = z
	.object({
		perTarget: z.record(z.string(), z.string().datetime()).optional(),
		scheduledAt: z.string().datetime().optional(),
	})
	.optional();

function normalizeSchedule(schedule) {
	if (!schedule) return undefined;
	return {
		scheduledAt: schedule.scheduledAt,
		targetSchedules: schedule.perTarget,
	};
}

function normalizeComposeMedia(media) {
	if (!media?.assetIds?.length) return media;
	return {
		...media,
		items: media.assetIds.map((assetId) => ({ assetId })),
	};
}

function normalizePostPlanChanges(changes = {}) {
	return {
		content: changes.content,
		media: changes.media,
		overrides: changes.platformConfig ?? changes.overrides,
		publishOptions: normalizeSchedule(changes.schedule) ?? changes.publishOptions,
		targets: changes.targets,
	};
}

export const ACTION_REGISTRY = {
	workspaceContext: {
		mcpInputSchema: {},
		async run(_args, ctx) {
			const payload = await agentreacherRequest("/api/workspaces", {
				...requestOptions(ctx),
			});
			const availableWorkspaces = payload.workspaces ?? [];
			const activeWorkspace =
				availableWorkspaces.find((workspace) => workspace.isActive) ??
				availableWorkspaces[0] ??
				null;
			return {
				activeWorkspace,
				availableWorkspaces,
				capabilities: payload.capabilities ?? {},
				currentRole: activeWorkspace?.role ?? null,
				limits: payload.limits ?? {},
				subscription: payload.subscription ?? null,
				timezone:
					payload.timezone ??
					Intl.DateTimeFormat().resolvedOptions().timeZone ??
					null,
			};
		},
	},
	workspaceAction: {
		mcpInputSchema: {
			action: z.enum(["create", "switch", "delete"]),
			name: z.string().min(1).max(80).optional(),
			workspaceId: z.string().min(1).optional(),
		},
		async run(args, ctx) {
			if (args.action === "create") {
				const payload = await agentreacherRequest("/api/workspaces", {
					...requestOptions(ctx),
					body: { name: args.name },
					method: "POST",
				});
				await persistWorkspaceApiKey(payload, payload.workspace?.id);
				return { action: args.action, created: true, workspace: payload.workspace ?? null };
			}
			if (args.action === "switch") {
				const payload = await agentreacherRequest("/api/workspaces", {
					...requestOptions(ctx),
					body: { workspaceId: args.workspaceId },
					method: "PUT",
				});
				await persistWorkspaceApiKey(payload, args.workspaceId);
				return { action: args.action, switched: true, workspace: payload.workspace ?? null };
			}
			const payload = await agentreacherRequest("/api/workspaces", {
				...requestOptions(ctx),
				body: args.workspaceId ? { workspaceId: args.workspaceId } : undefined,
				method: "DELETE",
			});
			await persistWorkspaceApiKey(payload, payload.workspace?.id);
			return { action: args.action, deleted: payload.deleted ?? true, workspace: payload.workspace ?? null };
		},
	},
	integrationList: {
		mcpInputSchema: {},
		async run(_args, ctx) {
			const payload = await agentreacherRequest("/api/social/accounts", {
				...requestOptions(ctx),
			});
			return {
				accounts: normalizeSocialChannelListForAgent(payload.accounts ?? []),
				availableProviders: PROVIDERS,
			};
		},
	},
	integrationConnect: {
		mcpInputSchema: { provider: z.enum(PROVIDERS) },
		async run(args, ctx) {
			const { provider } = args;
			if (provider === "bluesky") {
				const payload = await agentreacherRequest(
					"/api/social/bluesky/connection?mcp_start=1",
					{ ...requestOptions(ctx) },
				);
				return {
					...payload,
					instructions:
						"Open the secure AgentReacher setup page. It will guide the user to create a Bluesky app password and enter it outside the chat.",
					provider,
					status: "authorization_required",
				};
			}
			const oauthPath = providerOauthStartPaths[provider];
			if (!oauthPath) throw new Error(`OAuth connection is not supported for ${provider}.`);
			const payload = await agentreacherRequest(oauthPath, { ...requestOptions(ctx) });
			return { ...payload, provider, status: "authorization_required" };
		},
	},
	integrationDisconnect: {
		mcpInputSchema: {
			channelId: z.string().min(1).optional(),
			provider: z.enum(PROVIDERS),
		},
		async run(args, ctx) {
			const path = args.channelId
				? withQuery(providerConnectionPaths[args.provider], { channelId: args.channelId })
				: providerConnectionPaths[args.provider];
			const payload = await agentreacherRequest(path, {
				...requestOptions(ctx),
				method: "DELETE",
			});
			return {
				channel: normalizeSocialChannelForAgent(payload.channel ?? null),
				provider: args.provider,
				status: "disconnected",
			};
		},
	},
	integrationAction: {
		mcpInputSchema: {
			action: z.enum(["list_boards", "create_board"]),
			input: z.record(z.string(), z.unknown()).optional(),
			provider: z.enum(PROVIDERS),
		},
		async run(args, ctx) {
			const input = args.input ?? {};
			if (args.provider !== "pinterest") {
				throw new Error(`No integrationAction helpers are available for ${args.provider}.`);
			}
			if (args.action === "list_boards") {
				return agentreacherRequest(
					withQuery("/api/social/pinterest/boards", { channelId: input.channelId }),
					{ ...requestOptions(ctx) },
				);
			}
			return agentreacherRequest("/api/social/pinterest/boards", {
				...requestOptions(ctx),
				body: {
					action: "create_board",
					channelId: input.channelId,
					description: input.description,
					name: input.name,
					privacy: input.privacy,
				},
				method: "POST",
			});
		},
	},
	postSchema: {
		mcpInputSchema: {
			contentType: z.enum(["text", "image", "video"]),
			targets: z.array(UNIFIED_TARGET_SCHEMA).min(1),
		},
		async run(args, _ctx) {
			return {
				contentType: args.contentType,
				missingRequiredSettings: [],
				supportedConfigFields: [
					"boardId", "brandContent", "disableComments", "disableDuet",
					"disableStitch", "igAltText", "igCollaborators",
					"igDisableComments", "igPostType", "igShareToFeed", "privacy",
					"text", "title",
				],
				targets: args.targets,
				validationHints: [
					"Caption text is required before publishing.",
					"Use mediaPrepare before image or video postCompose when media is not already in AgentReacher.",
					"Pinterest requires platformConfig.pinterest.boardId before publish.",
				],
			};
		},
	},
	postCompose: {
		mcpInputSchema: {
			content: CREATE_POST_CONTENT_SCHEMA,
			contentType: z.enum(["text", "image", "video"]),
			media: COMPOSE_POST_MEDIA_SCHEMA.optional(),
			mode: z.enum(["draft", "scheduled"]),
			platformConfig: z.record(z.string(), PLATFORM_OVERRIDE_SCHEMA).optional(),
			postId: z.string().min(1).optional(),
			schedule: POST_SCHEDULE_SCHEMA,
			targets: z.array(UNIFIED_TARGET_SCHEMA).min(1),
		},
		async run(args, ctx) {
			const media = normalizeComposeMedia(args.media);
			if (args.postId) {
				const payload = await agentreacherRequest(`/api/social/posts/${args.postId}`, {
					...requestOptions(ctx),
					body: {
						action: "update",
						content: normalizeCreatePostContent(args.content),
						media,
						overrides: args.platformConfig,
						publishOptions: normalizeSchedule(args.schedule),
						targets: args.targets,
					},
					method: "PATCH",
				});
				return normalizeUnifiedPostForMcp(payload.post ?? null);
			}
			const payload = await agentreacherRequest("/api/social/posts", {
				...requestOptions(ctx),
				body: {
					action: "create_post",
					content: normalizeCreatePostContent(args.content),
					contentType: args.contentType,
					media,
					overrides: args.platformConfig,
					publishOptions: normalizeSchedule(args.schedule),
					targets: args.targets,
				},
				method: "POST",
			});
			return normalizeUnifiedPostForMcp(payload.post ?? null);
		},
	},
	postPlan: {
		mcpInputSchema: {
			changes: z.record(z.string(), z.unknown()).optional(),
			filters: z
				.object({
					limit: z.number().int().min(1).max(100).optional(),
					status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
				})
				.optional(),
			goal: z.enum(["list", "inspect", "revise", "cancel", "delete"]),
			postId: z.string().min(1).optional(),
		},
		async run(args, ctx) {
			if (args.goal === "list") {
				const payload = await agentreacherRequest(
					withQuery("/api/social/posts", { limit: args.filters?.limit }),
					{ ...requestOptions(ctx) },
				);
				let posts = normalizeUnifiedPostListForMcp(payload.posts ?? []);
				if (args.filters?.status) posts = posts.filter((post) => post?.status === args.filters.status);
				return { posts };
			}
			if (!args.postId) throw new Error("postId is required for this postPlan goal.");
			if (args.goal === "inspect") {
				const payload = await agentreacherRequest(`/api/social/posts/${args.postId}`, {
					...requestOptions(ctx),
				});
				return normalizeUnifiedPostForMcp(payload.post ?? null);
			}
			if (args.goal === "delete" || args.goal === "cancel") {
				return agentreacherRequest(`/api/social/posts/${args.postId}`, {
					...requestOptions(ctx),
					method: "DELETE",
				});
			}
			const payload = await agentreacherRequest(`/api/social/posts/${args.postId}`, {
				...requestOptions(ctx),
				body: { action: "update", ...normalizePostPlanChanges(args.changes) },
				method: "PATCH",
			});
			return normalizeUnifiedPostForMcp(payload.post ?? null);
		},
	},
	postPublish: {
		mcpInputSchema: {
			mode: z.enum(["now", "resume_scheduled", "retry_failed_targets"]),
			postId: z.string().min(1),
			targets: z.array(UNIFIED_TARGET_SCHEMA).optional(),
		},
		async run(args, ctx) {
			if (args.mode === "retry_failed_targets") {
				throw new Error("retry_failed_targets is not yet available without deliveryId support; call postStatus to inspect failures first.");
			}
			const payload = await agentreacherRequest(`/api/social/posts/${args.postId}`, {
				...requestOptions(ctx),
				body:
					args.mode === "now"
						? { action: "publish_now" }
						: { action: "schedule", publishOptions: {}, targets: args.targets },
				method: "PATCH",
			});
			let post = payload.post ?? null;
			if (args.mode === "now" && post?.status === "processing") post = await waitForUnifiedPost(post.id, ctx);
			return normalizeUnifiedPostForMcp(post);
		},
	},
	postStatus: {
		mcpInputSchema: {
			deliveryId: z.string().min(1).optional(),
			limit: z.number().int().min(1).max(100).optional(),
			postId: z.string().min(1).optional(),
		},
		async run(args, ctx) {
			if (args.postId) {
				const payload = await agentreacherRequest(`/api/social/posts/${args.postId}`, {
					...requestOptions(ctx),
				});
				const post = normalizeUnifiedPostForMcp(payload.post ?? null);
				if (args.deliveryId && Array.isArray(post?.deliveries)) {
					return { delivery: post.deliveries.find((delivery) => delivery.id === args.deliveryId) ?? null, post };
				}
				return post;
			}
			const payload = await agentreacherRequest(
				withQuery("/api/social/posts", { limit: args.limit }),
				{ ...requestOptions(ctx) },
			);
			return { posts: normalizeUnifiedPostListForMcp(payload.posts ?? []) };
		},
	},
	mediaPrepare: {
		mcpInputSchema: {
			purpose: z.enum(["post_media", "library"]),
			source: z.union([
				z.object({ type: z.literal("url"), url: z.string().url() }),
				z.object({ content: z.string().min(1), contentType: z.string().min(1), filename: z.string().optional(), type: z.literal("base64") }),
				z.object({ contentType: z.string().min(1), fileSizeBytes: z.number().int().positive(), filename: z.string(), type: z.literal("direct_upload") }),
			]),
		},
		async run(args, ctx) {
			if (args.source.type === "direct_upload") {
				return agentreacherRequest("/api/social/upload-media", {
					...requestOptions(ctx),
					body: { action: "create_upload_url", contentType: args.source.contentType, fileSizeBytes: args.source.fileSizeBytes, filename: args.source.filename },
					method: "POST",
				});
			}
			if (args.source.type === "url") return uploadMediaFromArgs({ sourceUrl: args.source.url }, ctx);
			return uploadMediaFromArgs(args.source, ctx);
		},
	},
	teamAction: {
		mcpInputSchema: {
			action: z.enum(["list_members", "invite_member"]),
			email: z.string().email().optional(),
			role: z.enum(["member", "admin"]).optional(),
		},
		async run(args, ctx) {
			if (args.action === "list_members") {
				const payload = await agentreacherRequest("/api/workspaces/members", {
					...requestOptions(ctx),
				});
				return { invitations: payload.invitations ?? [], members: payload.members ?? [] };
			}
			return agentreacherRequest("/api/workspaces/invitations", {
				...requestOptions(ctx),
				body: { email: args.email, role: args.role === "admin" ? "member" : args.role },
				method: "POST",
			});
		},
	},
	feedbackSend: {
		mcpInputSchema: {
			category: z.enum(["bug", "idea", "ux", "onboarding", "other"]).optional(),
			contactEmail: z.string().email().optional(),
			message: z.string().min(10).max(4000),
		},
		async run(args, ctx) {
			return agentreacherRequest("/api/mcp/feedback", {
				...requestOptions(ctx),
				body: { category: args.category, contactEmail: args.contactEmail, message: args.message },
				method: "POST",
			});
		},
	},
};
export const ACTION_NAMES = Object.keys(ACTION_REGISTRY);

export async function runAction(name, args = {}, ctx = {}) {
	const action = ACTION_REGISTRY[name];
	if (!action) {
		throw new Error(`Unknown AgentReacher action: ${name}`);
	}
	const parsed = z.object(action.mcpInputSchema).strict().parse(args);
	return action.run(parsed, ctx);
}
