#!/usr/bin/env python3
"""
Cleans up duplicate Notebook insertions (caused by re-running
add_notebook_feature.py after a failed first migration attempt).
Collapses each duplicated block down to exactly one occurrence.
Safe to run even if there's only one copy already -- it's a no-op then.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
INDEX_TS_PATH = os.path.join(ROOT, "backend", "src", "index.ts")
APP_TSX_PATH = os.path.join(ROOT, "frontend", "src", "App.tsx")


def dedupe_block(content, block, keep=1):
    count = content.count(block)
    if count <= keep:
        return content, count
    parts = content.split(block)
    result = parts[0]
    for i in range(1, len(parts)):
        if i <= keep:
            result += block + parts[i]
        else:
            result += parts[i]
    return result, count


def apply_dedupe(path, blocks_with_labels):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    changed = False
    for block, label in blocks_with_labels:
        new_content, original_count = dedupe_block(content, block, keep=1)
        if original_count > 1:
            print(f"[FIXED] {label}: found {original_count} copies -> reduced to 1  ({path})")
            content = new_content
            changed = True
        else:
            print(f"[OK] {label}: already {original_count} copy, no change needed  ({path})")

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)


# ------------------------------------------------------------------
# schema.prisma
# ------------------------------------------------------------------
notebook_model_block = (
    "// ─────────────────────────────────────────────\n"
    "// NOTEBOOK\n"
    "// ─────────────────────────────────────────────\n"
    "// Personal notes, private to the owning user. No sharing in v1 --\n"
    "// each user only ever sees their own notes.\n\n"
    "model Note {\n"
    "  id        String   @id @default(uuid())\n"
    "  userId    String\n"
    "  user      User     @relation(fields: [userId], references: [id])\n"
    "  title     String   @default(\"Untitled note\")\n"
    "  content   String\n\n"
    "  createdAt DateTime @default(now())\n"
    "  updatedAt DateTime @updatedAt\n\n"
    "  @@index([userId])\n"
    "}\n\n"
)

apply_dedupe(SCHEMA_PATH, [
    ("  notes Note[]\n", "User.notes relation line"),
    (notebook_model_block, "Note model block"),
])

# ------------------------------------------------------------------
# backend/src/index.ts
# ------------------------------------------------------------------
apply_dedupe(INDEX_TS_PATH, [
    ("import notesRoutes from './routes/notes.routes';\n", "notesRoutes import"),
    ("app.use('/notes', notesRoutes);\n", "notesRoutes app.use"),
])

# ------------------------------------------------------------------
# frontend/src/App.tsx
# ------------------------------------------------------------------
apply_dedupe(APP_TSX_PATH, [
    ("import Notebook from './pages/notebook/Notebook';\n", "Notebook import"),
    ('                <Route path="/notebook" element={<Notebook />} />\n', "Notebook route"),
])

print("\nDone. Next: npx prisma migrate dev --name add_notebook, then npx tsc --noEmit in both backend/ and frontend/.")
