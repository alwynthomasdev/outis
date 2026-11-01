# PII library

The library is the data Outis draws fakes from, plus your additions to detection. Edit it on the **PII library** screen. Changes apply when you press **Save changes**.

| Tab                          | Contents                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| Names                        | Female first names, male first names, surnames                         |
| Places                       | Towns with postcode areas (`Leeds, LS`), street names, street suffixes |
| Email, phone & organisations | Email domains, mobile and landline formats, organisation names         |
| Always / never               | Words always treated as PII; words never treated as PII                |
| Custom detectors             | Your regular expressions, with a live test box                         |

The library is stored in your app data folder as `library.json` (the path is shown in Settings → About). **Export…** and **Import…** let you share it. **Reset to defaults** restores the built-in lists.

## How the lists are used

- **First names** are also used to keep gender: a name found in the female list is replaced with a female name. Names in neither list get any name.
- **Surnames** and first names help Outis recognise names inside email addresses (`sjenkins@…`), and are used by the column suggester.
- **Towns** come with a postcode area so that fake addresses hang together. With the ML model off, town names are also detected in text.
- **Phone formats** use `#` for a random digit. The defaults are Ofcom's ranges reserved for TV and radio drama: mobile `07700 900###`, and landlines like `0113 496 0###` and `020 7946 0###`. They are never allocated to real people.
- **Email domains** should be reserved domains (`example.com`, `example.org`, `example.net`, `*.example`, `*.test`) so fake addresses can never reach anyone.
- **Organisations**: leave empty to generate company names.
- **Always treat as PII**: whole-word, case-insensitive matches in free text, replaced as `CUSTOM`. Good for client names, project code names, and internal IDs.
- **Never treat as PII**: exact matches (case-insensitive) are never replaced, whatever found them. The defaults include NHS, HMRC, DVLA, GP, UK, and the days of the week.

## Custom detectors

Each detector has a name, a JavaScript regular expression, flags (`g` is added automatically; `i` for case-insensitive), and the PII type to treat matches as. For example:

| Name                 | Pattern                       | Type      |
| -------------------- | ----------------------------- | --------- |
| Order reference      | `\bORD-\d{6}\b`               | `CUSTOM`  |
| Staff ID             | `\bEMP\d{5}\b`                | `GENERIC` |
| Vehicle registration | `\b[A-Z]{2}\d{2} ?[A-Z]{3}\b` | `GENERIC` |

Custom detectors run in free text and in fields set to _Scan as free text_.

## File format

```json
{
  "version": 1,
  "firstNames": { "female": ["Olivia"], "male": ["Noah"] },
  "lastNames": ["Smith"],
  "towns": [{ "name": "Leeds", "postcodeArea": "LS" }],
  "streetNames": ["High"],
  "streetSuffixes": ["Street"],
  "emailDomains": ["example.com"],
  "phoneFormats": { "mobile": ["07700 900###"], "landline": ["0113 496 0###"] },
  "organisations": [],
  "allowList": ["NHS"],
  "denyList": ["Project Falcon"],
  "customDetectors": [
    {
      "id": "a1",
      "name": "Order ref",
      "pattern": "\\bORD-\\d{6}\\b",
      "flags": "g",
      "type": "CUSTOM",
      "enabled": true
    }
  ]
}
```

Missing sections are filled in from the defaults. Lists that fakes depend on (names, towns, streets, domains, phone formats) can't be empty; an empty one falls back to the default.

## Changing the library changes fakes

Fakes are picked from these lists, so editing a list changes which fake a value gets, even with the same consistency key. Keep the library and the key fixed if you need results to match between runs.
