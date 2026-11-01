# Security

Outis is designed to handle personal data without it leaving your computer. It makes no network connections; see [docs/architecture.md](docs/architecture.md#how-outis-stays-offline).

## Reporting a problem

If you find a way that data could leak, whether over a network connection, into a file you didn't choose, or through a fake that is a real person's details, please report it privately with a [GitHub security advisory](https://github.com/alwynthomasdev/outis/security/advisories/new) rather than a public issue. Don't include real personal data in your report.

## Things to know

- **Detection is not perfect.** Always review results before sharing anonymised data.
- **Consistent fakes are pseudonymisation, not anonymisation.** Anyone with your consistency key and a guess at an original value can check the guess. Keep the key private, or generate a new key for data you share widely.
- **The mapping export contains the original data.** Only export it if you need it, and store it securely.
- **Hashes are keyed** with the consistency key (HMAC-SHA256), so they can't be reversed with a lookup table without the key.
