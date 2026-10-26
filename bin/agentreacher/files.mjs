import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJsonFile(pathname, fallbackValue) {
	try {
		const fileContents = await readFile(pathname, "utf8");
		return JSON.parse(fileContents);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return fallbackValue;
		}

		throw error;
	}
}

export async function writeJsonFile(pathname, value) {
	await mkdir(path.dirname(pathname), { recursive: true });
	await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
