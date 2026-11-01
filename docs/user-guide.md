# User guide

Outis has four screens, in the sidebar: **Files**, **Text**, **PII library** and **Settings**. The status bar at the bottom shows that the app is offline, and whether the ML model is ready.

## Files (CSV and JSON)

Supported formats: `.csv`, `.tsv` (delimiter detected automatically), `.json`, and `.jsonl` / `.ndjson` (one JSON value per line).

### 1. Open

Drag a file onto the window or press **Choose a file…**. Files over 200 MB ask for confirmation, because the whole file is loaded into memory.

### 2. Choose what to replace

Each column (CSV) or property path (JSON) is listed with:

- **Sample values** from the file.
- **Suggestion**: what Outis thinks the field holds, from its name and values. Hover for the reason and confidence.
- **Action**: what to do with the values.
- **Replace as**: the kind of fake to make (for _Replace with fake_ and _Redact_), the fixed value, or how many characters to leave visible when masking.

Suggestions are applied automatically when a file opens. **Use suggestions** puts them back; **Keep everything** sets every field to _Keep unchanged_.

| Action            | Result for `sarah.jenkins@gmail.com`                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| Replace with fake | `emily.lewis@example.org`                                                           |
| Mask              | `********************.com` with "show last 4"                                       |
| Hash              | `3f9a1c0b7d2e4a51` (16 hex characters, keyed with your consistency key)             |
| Redact            | `[EMAIL]`                                                                           |
| Fixed value       | whatever you type                                                                   |
| Empty             | (blank)                                                                             |
| Scan as free text | Finds PII _inside_ the value, as on the Text screen. Use it for notes and comments. |
| Keep unchanged    | `sarah.jenkins@gmail.com`                                                           |

For JSON you can also **Add path pattern**, for example `**.email` to cover every `email` property at any depth. See [recipes.md](recipes.md).

Press **Anonymise →** to run. Large files show progress and can be cancelled.

### 3. Review changes

The summary shows how many values changed and of what type. View modes for tables:

- **Inline changes**: changed cells show ~~original~~ → new. Long text gets a word-level diff.
- **Side by side**: each changed column is split into _Original_ and _Anonymised_.
- **Original** / **Anonymised**: one version, with changed cells highlighted.

**Changed rows only** hides rows with no changes. Column headers show how many cells changed.

For JSON, **Side by side** shows both documents line by line with changes highlighted. **List of changes** shows each changed path.

### 4. Export

**Export anonymised file…** saves a copy (default name `name.anonymised.csv`). The original file is never touched. Formatting is kept: delimiter, line endings, BOM, quoting where needed, JSON indentation, and numbers stay numbers where possible.

### Recipes

**Save recipe** stores the current rules as a `.outis-recipe.json` file. **Load recipe** applies one to the open file. Rules match by column name or path, and Outis tells you how many matched.

## Text

1. Paste text, open a file (`.txt`, `.md`, `.log`, `.eml`…), or press **Try a sample**.
2. Press **Find PII →**.
3. Review the highlights on the left:
   - **Click** a highlight to ignore it (it gets struck through). Click again to restore it.
   - **Select** any text to mark it as PII. Pick a type, then **Mark as PII**. _All occurrences_ marks every copy of the same text.
   - The tags along the bottom count each type. Click one to ignore or restore all of that type.
4. The right-hand pane shows the result. **Changes** shows the original with each replacement inline.
5. **Copy** or **Save as…**.

**Detection options**: switch the ML model on or off, set its confidence threshold, choose fakes / `[LABELS]` / `****`, and choose which types to look for. Defaults live in Settings.

## PII library

See [library.md](library.md). Changes take effect when you press **Save changes**.

## Settings

- **Consistency key**: the secret that fakes are derived from. Keep the same key to get the same fakes across files and sessions. A colleague with the same key gets identical results. **New key…** starts afresh.
- **Export original → fake mapping**: saves every pair mapped so far in this session. This file contains the original personal data, so treat it as sensitive.
- **CSV files have a header row**.
- **Free text defaults**: the same options as on the Text screen.
- **ML model**: status, and a button to load it now.
- **Network guard**: lists any blocked network attempts. This should always be empty.

## Tips

- Review before you share. Detection is good but not perfect, especially for names in lower case or unusual formats.
- Use the **Always treat as PII** list for client names, project code names, and internal IDs.
- Use **Never treat as PII** for your own company name and product names, so they aren't replaced.
- Free-text columns are often where PII hides. Use _Scan as free text_ on notes and comments.
