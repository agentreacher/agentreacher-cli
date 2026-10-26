import assert from "node:assert/strict";
import test from "node:test";
import { getOutputMode, parseCliOptions, resolveCliCommand } from "../bin/agentreacher/cli.mjs";
import { runAction } from "../bin/agentreacher/actions.mjs";

test("resolves raw action commands", () => {
  const invocation = resolveCliCommand(["run", "postPlan", "--input", '{"goal":"list"}']);
  assert.equal(invocation.kind, "action-run");
  assert.equal(invocation.actionName, "postPlan");
});

test("parses JSON and output flags without consuming positionals", () => {
  const parsed = parseCliOptions(["run", "workspaceContext", "--pretty", "--input={}"]);
  assert.deepEqual(parsed.positionals, ["run", "workspaceContext"]);
  assert.equal(parsed.options.pretty, true);
  assert.equal(parsed.options.input, "{}");
  assert.equal(getOutputMode(parsed.options, false), "pretty");
});

test("validates action payloads before making requests", async () => {
  await assert.rejects(
    () => runAction("postSchema", { contentType: "text", targets: [] }),
    /too small|at least 1/i,
  );
});
