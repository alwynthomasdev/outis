# Detectors

Free text (and fields set to _Scan as free text_) is checked by three layers. Their results are then merged.

1. **Rules**: regular expressions, many with checksum or context checks (below). Always on.
2. **ML model**: [bert-base-NER](https://huggingface.co/dslim/bert-base-NER), quantised to ~110 MB and run locally with ONNX Runtime. Finds people (`PERSON`), places (`LOCATION`), organisations (`ORG`) and other entities (`MISC`).
3. **Dictionaries**: used only when the ML model is off or missing. A known first name followed by a capitalised word is a `PERSON`, and a library town name is a `CITY`.

Your library adds two more sources: **custom detectors** (your regexes) and the **Always treat as PII** list.

## Merging

When matches overlap, Outis keeps one, in this order of priority:

1. text you marked yourself
2. the _Always treat as PII_ list
3. rules and custom detectors
4. the ML model
5. dictionaries

Within the same priority the longer match wins, then the higher score. Anything on the _Never treat as PII_ list is dropped. ML matches below the confidence threshold (default 60%) are dropped.

## Rule detectors

| Detector            | Type             | Matches                                             | Check                                                     |
| ------------------- | ---------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Email               | `EMAIL`          | `name@domain.tld`                                   | –                                                         |
| Web address         | `URL`            | `http(s)://…`                                       | –                                                         |
| IBAN                | `IBAN`           | `GB82 WEST 1234 5698 7654 32`                       | mod-97                                                    |
| Payment card        | `CARD`           | 13–19 digits, spaces/dashes allowed                 | Luhn                                                      |
| NHS number          | `NHS_NUMBER`     | `943 476 5919`                                      | mod-11; higher score after "NHS"                          |
| NI number           | `NI_NUMBER`      | `AB 12 34 56 C`                                     | valid prefix letters; excludes BG, GB, NK, KN, TN, NT, ZZ |
| UK phone            | `PHONE`          | `07700 900123`, `0161 496 0000`, `+44 20 7946 0000` | 10–11 digits (or +44 form)                                |
| International phone | `PHONE`          | `+33 1 23 45 67 89`                                 | 8–15 digits                                               |
| UK postcode         | `POSTCODE`       | `LS6 2AB`, `sw1a 1aa`                               | official format; mixed case rejected                      |
| Sort code           | `SORT_CODE`      | `20-00-00`                                          | higher score after "sort"                                 |
| Account number      | `ACCOUNT_NUMBER` | 8 digits                                            | only when "account" or "a/c" is just before               |
| IPv4 / IPv6         | `IP`             | `81.2.69.160`, `2001:db8::1`                        | octets 0–255                                              |
| Dates               | `DATE`           | `1985-03-12`, `12/03/1985`, `12 March 1985`         | higher score after "birth", "DOB", "born"                 |
| Street address      | `ADDRESS`        | `14 Oak Avenue`, `Flat 2, 9 Church Lane`            | number + capitalised words + street suffix                |
| Titled name         | `PERSON`         | the name in `Mrs Patel`, `Dr Priya Shah`            | –                                                         |

## Column suggestions

For files, each column or path gets a suggestion from:

- its **name** (`email`, `first_name`, `surname`, `phone`, `postcode`, `dob`, `notes`…), and
- up to 200 **sample values**: a type is suggested when at least 60% of values match a rule detector, or are names from the library. Long, wordy values suggest _Scan as free text_.

## Types

| Type                                                       | Fake made with _Replace with fake_                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `PERSON`                                                   | Fake first + last name, word by word; titles and initials kept          |
| `FIRST_NAME`, `LAST_NAME`                                  | From the library; female names map to female names, male to male        |
| `EMAIL`                                                    | Name parts follow the name mapping; domain from the library's safe list |
| `USERNAME`                                                 | As the part of an email before the `@`                                  |
| `PHONE`                                                    | Ofcom drama range; mobile stays mobile; +44 and spacing style kept      |
| `ADDRESS`                                                  | Number + street + suffix (+ town, postcode if the original had commas)  |
| `CITY`, `LOCATION`                                         | Library town                                                            |
| `POSTCODE`                                                 | In the postcode area of the fake town (Leeds→Luton gives LS→LU)         |
| `ORG`                                                      | From the library list, or a generated company name                      |
| `NI_NUMBER`                                                | `QQ` prefix (never issued)                                              |
| `NHS_NUMBER`                                               | `999` range, valid check digit                                          |
| `CARD`                                                     | `4000…`, valid Luhn, same length and grouping                           |
| `IBAN`                                                     | GB: bank code `TEST`; others: random, valid check digits                |
| `SORT_CODE`, `ACCOUNT_NUMBER`, `GENERIC`, `CUSTOM`, `MISC` | Same shape, random characters (digit → digit, letter → letter)          |
| `IP`                                                       | `192.0.2.x`, `198.51.100.x`, `203.0.113.x`, `2001:db8::…`               |
| `URL`                                                      | Host from the safe domain list; path scrambled                          |
| `DATE`                                                     | Shifted by up to ±180 days, same format                                 |

Letter case (`SMITH`, `smith`) and surrounding spaces are kept.
