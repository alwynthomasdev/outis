# Changelog

All notable changes to Outis are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-01

First release.

### Added

- Anonymise CSV, TSV, JSON and JSON Lines files by column or property path, with actions: fake, mask, hash, redact, fixed value, empty, scan as free text, keep.
- Suggested rules for every field, from field names and sample values.
- JSON path patterns (`**.email`, `orders[*].*.phone`).
- Recipes: save and load rule sets.
- Free-text anonymisation with rule detectors (email, UK and international phone, UK postcode, NI number, NHS number, card, IBAN, sort code, account number, IP, URL, dates, street addresses, titled names) and a bundled offline NER model (bert-base-NER) for people, places and organisations.
- Review highlights in text: click to ignore, select to mark, toggle a whole type.
- Consistent fakes from a secret key; names mapped word by word so emails and titles stay coherent; postcodes follow the fake town.
- Safe fake ranges: Ofcom drama phone numbers, reserved email domains, `QQ` NI numbers, `999` NHS numbers, documentation IP ranges.
- Editable PII library (names, towns, streets, domains, phone formats, organisations), allow and deny lists, custom regex detectors, and import/export.
- Compare views: inline, side by side, original or anonymised for tables; line-by-line diff and change list for JSON; inline diff for text.
- Offline guard: DNS block, request filter, CSP, window lock-down and worker network block, with a log in Settings.
- Optional export of the original→fake mapping, with a warning.
- Windows installer and portable build; GitHub Actions CI and tag-triggered releases.
- VS Code F5 debugging for main process, window and worker.

[Unreleased]: https://github.com/alwynthomasdev/outis/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alwynthomasdev/outis/releases/tag/v0.1.0
