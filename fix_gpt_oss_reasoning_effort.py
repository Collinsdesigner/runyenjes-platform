#!/usr/bin/env python3
"""
Root cause: openai/gpt-oss-120b is a reasoning model. Without an explicit
reasoning_effort, it can spend its entire max_tokens budget on internal
chain-of-thought (which never appears in `content`) before it even starts
writing the visible answer -- for a trivial task like "suggest a title
from this filename", that reasoning can consume the whole budget and
leave content: "" every time, no matter how high maxTokens is set.

Fix: explicitly set reasoning_effort: 'low' on every callGroq request.
None of these tasks (quiz generation, feedback, grading suggestions,
content drafting, text-assist) need deep multi-step reasoning, so this
should make all of them more reliable and faster, not just this one task.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    content = f.read()

old = (
    "    body: JSON.stringify({\n"
    "      model: MODEL,\n"
    "      messages: [\n"
    "        { role: 'system', content: systemPrompt },\n"
    "        { role: 'user', content: userMessage },\n"
    "      ],\n"
    "      temperature: 0.6,\n"
    "      max_tokens: maxTokens,\n"
    "    }),\n"
)
new = (
    "    body: JSON.stringify({\n"
    "      model: MODEL,\n"
    "      messages: [\n"
    "        { role: 'system', content: systemPrompt },\n"
    "        { role: 'user', content: userMessage },\n"
    "      ],\n"
    "      temperature: 0.6,\n"
    "      max_tokens: maxTokens,\n"
    "      reasoning_effort: 'low',\n"
    "    }),\n"
)

count = content.count(old)
if count == 0:
    if "reasoning_effort: 'low'" in content:
        print("[SKIP] reasoning_effort already set in callGroq")
    else:
        raise SystemExit("[FAIL] Could not find the callGroq fetch body to patch -- paste the current callGroq function.")
elif count > 1:
    raise SystemExit("[FAIL] That body block appears more than once -- refusing to guess which one.")
else:
    content = content.replace(old, new)
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] reasoning_effort: 'low' added to callGroq -> {AI_ROUTES_PATH}")

print("\nDone. Next: npx tsc --noEmit in backend/, commit, push, wait for Render to redeploy, then retest.")
