# OML Modeling Workspace (`oml-code`)

This repository contains the OML (Ontology Modeling Language) tooling stack:

- A **Langium-based language package** that defines the OML grammar, AST, validation, and utilities.
- A **VS Code extension** that provides language support for `.oml` files and an interactive diagram view.
- An optional **CLI** for running generators over OML models.

The workspace is organized as a multi-package monorepo under `packages/`.

## Packages

- `packages/language` – Core OML language definition and services (parser, AST, validation, diagram model helpers).
- `packages/cli` *(optional)* – Command-line interface for running generators and other OML tooling.
- `packages/extension` – VS Code extension that wires the language server and diagram webview.

See each package’s README for details, especially:

- Language: `packages/language/README.md`
- Extension: `packages/extension/README.md`

## What the VS Code extension does

The extension (in `packages/extension`) provides:

- Syntax highlighting and language support for `.oml` vocabularies and descriptions.
- A language server (via Langium) for parsing, linking, and validation.
- A diagram view for OML vocabularies that shows:
  - Nodes for concepts, aspects, and relation entities.
  - Specialization edges between entities.
  - Relation edges (reified and unreified) with arrow markers.
  - Relation end labels that include:
	 - Forward and reverse relation names.
	 - Cardinalities derived from `PropertyCardinalityRestrictionAxiom` (e.g. `parent [0..2]`).
	 - Default `[0..1]` for functional relations when no explicit restriction exists.
	 - `{subsets ...}` lines for relations that specialize other relations (e.g. `father` subsets `parent`).

## Root-level files

- `package.json` – Workspace-level manifest with shared scripts and dev dependencies.
- `tsconfig.json` – Base TypeScript configuration shared by packages.
- `tsconfig.build.json` – Project references configuration for building all packages.
- `.gitignore` – Git ignore rules.

## Install dependencies

From the workspace root (`oml-code`):

```sh
cd modeling-environment/oml-code
npm install
```

## Generate and build everything

Most workflows use the root npm scripts, which coordinate all packages:

- Generate Langium artifacts (grammar → AST, parser, services):

```sh
npm run langium:generate
```

- Build all packages (language, extension, CLI):

```sh
npm run build
```

There is also a VS Code task **“Build oml”** that runs both in sequence:

```sh
npm run langium:generate && npm run build
```

You can trigger this task via **Terminal → Run Task… → Build oml**.

## Developing the language and extension

When actively working on the grammar or TypeScript code, you can use watch scripts from the root:

- Regenerate Langium output on grammar changes:

```sh
npm run langium:watch
```

- Rebuild TypeScript on code changes:

```sh
npm run watch
```

These affect the language package and the VS Code extension simultaneously.

## Running the VS Code extension

1. Open this folder (`oml-code`) in VS Code.
2. Make sure you have generated and built once:

	```sh
	npm run langium:generate
	npm run build
	```

3. Open the **Run and Debug** view and start the **Run Extension** configuration (created by Langium’s scaffold).
4. A new VS Code window opens with the OML extension loaded.
5. In the new window:
	- Open `sample-workspace/example.oml` or another `.oml` file.
	- Use the command palette (e.g. search for “OML Diagram”) or context menu to open the diagram view.

After modifying language or extension code, rebuild from the root:

```sh
npm run build
```

Then reload or re-launch the extension host window.

## Running the CLI (if present)

If `packages/cli` is included, you can run its commands through npm scripts. See `packages/cli/README.md` for concrete examples and options.

## Further documentation

- Langium documentation: <https://langium.org>
- VS Code extension authoring: <https://code.visualstudio.com/api>
