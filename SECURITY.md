# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Use GitHub's private reporting: the **Security** tab of the repository, then **Report a vulnerability** ([direct link](https://github.com/HarpeLm/kana/security/advisories/new)). Describe the problem, how to reproduce it and what it would allow.

You will get a reply as soon as possible, and we will keep you posted on the fix. Please give us time to fix the problem before making it public.

## What counts as a vulnerability

Kana runs coding agents, opens local files, drives a built-in browser and keeps API keys in the Keychain. In particular, these matter:

- an agent or a web page escaping its intended limits (reading or writing outside the working folder, bypassing a permission request, a "plan" mode that would modify files);
- a leak of an API key or of conversation content;
- execution of code coming from an artifact, a page or an opened file.

## Supported versions

Kana is young: only the latest version of the `main` branch receives fixes.
