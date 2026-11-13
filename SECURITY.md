# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Architecture Notes

Figrow runs user HTML/CSS inside isolated `<iframe srcdoc>` artboards communicating over a structured `MessageChannel` protocol (`src/engine/sandbox/`).
- No local files are ever uploaded to external servers (100% local-first execution).
- Local disk synchronization uses the browser's permission-gated **File System Access API**.

## In-Scope Security Surfaces

We particularly welcome security reports covering the following core surfaces:
- **`<iframe srcdoc>` Sandbox Isolation (`src/engine/sandbox/`):** Preventing untrusted artboard documents from escaping iframe boundaries or accessing the host studio context.
- **`MessageChannel` Runtime Bridge Validation:** Ensuring structured messages between the canvas runtime agent and the host studio cannot trigger arbitrary code execution or unauthorized state mutations.
- **Untrusted HTML/CSS AST Parsing (`parse5` / `postcss`):** Safeguarding source-range parsers, style value parsers, and AST serializers against crafted inputs, prototype pollution, or denial-of-service vectors.
- **File System Access API Permission Boundaries:** Ensuring local disk synchronization (`src/engine/fs/`) strictly respects user-granted directory/file handles without path traversal or unauthorized reads/writes.

## Reporting a Vulnerability

If you discover a security vulnerability (for example, sandbox breakout or XSS in the host studio UI), please **do not open a public issue**. Instead, report it privately via **GitHub Security Advisories** (`Security` tab -> `Report a vulnerability`) so we can release a patch before public disclosure.

## Response Timeline

We are committed to addressing security issues promptly and transparently:
- **Initial Acknowledgment:** Within **48 hours** of receiving your report.
- **Triage & Severity Assessment:** Within **7 days**, including reproduction confirmation and remediation plan.
- **Coordinated Patch Release:** We will develop, verify, and publish a patched release before coordinated public disclosure.

## Safe Harbor

We support safe harbor for good-faith security researchers:
- Any security research conducted in good faith in accordance with this policy is considered authorized conduct.
- We will not pursue legal action against researchers who discover and report vulnerabilities responsibly without harming users or services, and we will publicly credit your contribution (if desired) once the fix is released.
