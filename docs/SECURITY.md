# Security Policy

## Supported Versions

This project is personally maintained. Only the **latest `main` branch** is covered by this security policy.

| Version | Supported |
|---|---|
| main (latest) | ✅ |
| Older versions | ❌ |

## Reporting a Vulnerability

**Please do not open a public Issue or Pull Request for security vulnerabilities.** Doing so may expose the vulnerability to third parties before a fix is available.

Report vulnerabilities privately via [Security Advisories](https://github.com/NAKANO8/todo_app/security/advisories/new) (GitHub's Private vulnerability reporting feature).

> A dedicated email contact will be added in the future.

To help with triage, please include:

- Type of vulnerability (e.g. XSS, SQL injection, authentication bypass, missing rate limiting)
- Steps to reproduce (PoC if possible)
- Potential impact
- Affected version or commit hash

## Response Process

1. **Acknowledgement**: We will confirm receipt as soon as possible. Response times may vary due to academic or employment commitments.
2. **Triage**: We will assess the scope and severity of the reported issue.
3. **Fix**: Issues will be prioritized by severity. Critical vulnerabilities will be addressed promptly.
4. **Disclosure**: After a fix is released, we will coordinate with the reporter on public disclosure if appropriate (Coordinated Disclosure).
5. **Credit**: If the reporter wishes, their name will be credited in the fix or release notes.

> The maintainer has prior experience with Coordinated Disclosure through JPCERT/CC coordination, CVE assignment, and co-authoring a public disclosure report for a ReDoS vulnerability in a real-world OSS project.

## Scope

**In scope:**

- Source code in this repository (application and API)
- The production instance running at to-do.hikawata.com

**Out of scope:**

- Instances forked and operated independently by third parties
- Vulnerabilities in upstream dependencies — these are already monitored automatically via Dependabot. You do not need to report them separately, but reports about how this project uses a vulnerable package are welcome.

## Known Limitations

This project is individually maintained and self-hosted. Please keep the following in mind:

- No SLA or monitoring equivalent to commercial cloud services
- Fix deployment may take days to weeks depending on severity and maintainer availability

## Research Guidelines

When investigating vulnerabilities, please do not:

- Access or modify other users' data
- Degrade the availability of the service
- Run automated scanners against the production instance (to-do.hikawata.com)

## Safe Harbor

We will not pursue legal action against researchers who discover and report vulnerabilities in good faith and in accordance with this policy.

## Bug Bounty

This project does not offer a bug bounty program. We are unable to provide monetary compensation, but we will publicly credit reporters who wish to be acknowledged.

## Acknowledgements

Reporters will be listed here after a fix has been released.
