# Changelog

## [0.6.1](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.6.1-beta.0...v0.6.1) (2026-01-28)

## [0.6.1-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.6.0...v0.6.1-beta.0) (2026-01-28)

### Refactoring

* **provider:** improve Claude CLI command execution with temp files ([b42e560](https://github.com/Seungwoo321/genai-sonar-lint/commit/b42e56046a65ab47874359c3851563ddec6ba987))

## [0.6.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.6.0-beta.0...v0.6.0) (2026-01-28)

## [0.6.0-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.5.0...v0.6.0-beta.0) (2026-01-28)

### Features

* **analyze:** implement AI auto-fix mode with file-by-file processing ([c6da949](https://github.com/Seungwoo321/genai-sonar-lint/commit/c6da949beb53298cb09ccaa8138c0d7f7968ad25))
* **cli:** add auto-fix option for AI-powered automatic fixing ([4544149](https://github.com/Seungwoo321/genai-sonar-lint/commit/454414927f76aae871ba3d70c3d7b35cb53c598b))
* **providers:** add session reset for per-file context management ([734ad0e](https://github.com/Seungwoo321/genai-sonar-lint/commit/734ad0ee63cdef55039062c9eaa1e5fe0eb8b736))
* **types:** add autoFix option to AnalyzeOptions interface ([96f96bd](https://github.com/Seungwoo321/genai-sonar-lint/commit/96f96bd3bc59c1be2ff7562d5553394d9aa535c1))

## [0.5.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.5.0-beta.1...v0.5.0) (2026-01-28)

## [0.5.0-beta.1](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.5.0-beta.0...v0.5.0-beta.1) (2026-01-28)

### Features

* **cursor:** improve large prompt handling with temp files ([a32fafd](https://github.com/Seungwoo321/genai-sonar-lint/commit/a32fafdeea5db5a255e4808e6e5f2bd89eb691d3))

## [0.5.0-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.4.0...v0.5.0-beta.0) (2026-01-28)

### Features

* **cli:** read version from package.json dynamically ([861acc9](https://github.com/Seungwoo321/genai-sonar-lint/commit/861acc90a563defae08e10bc2c14134ce078467f))

## [0.4.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.4.0-beta.0...v0.4.0) (2026-01-28)

## [0.4.0-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.3.2-beta.0...v0.4.0-beta.0) (2026-01-28)

### Features

* **cli:** add custom ESLint config path option for monorepo support ([82935d0](https://github.com/Seungwoo321/genai-sonar-lint/commit/82935d0d8e79419d21517f38fcdda27ac6393232))

### Chores

* **release:** update npm publish configuration ([dce23da](https://github.com/Seungwoo321/genai-sonar-lint/commit/dce23da36f61d5afa69412bc027eae40f8633bb7))

## [0.3.2-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.3.1...v0.3.2-beta.0) (2026-01-17)

## [0.3.1](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.3.0...v0.3.1) (2026-01-17)

## [0.3.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.3.0-beta.0...v0.3.0) (2026-01-17)

## [0.3.0-beta.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.2.0...v0.3.0-beta.0) (2026-01-17)

### Features

* **analyze:** enhance error message with issue link ([587a5a6](https://github.com/Seungwoo321/genai-sonar-lint/commit/587a5a6f05595ae0de7786003833fa36bb8b8a57))
* **commands:** add models command ([bd9dcff](https://github.com/Seungwoo321/genai-sonar-lint/commit/bd9dcff6eb365f0f87de0ce561ced74b1ae11342))
* **cursor:** update CLI command and improve login ([c10968c](https://github.com/Seungwoo321/genai-sonar-lint/commit/c10968c20cc1ca600f163c32bcdb09a7eecaae35))

### Bug Fixes

* improve AI response parsing and add debug logging ([a351599](https://github.com/Seungwoo321/genai-sonar-lint/commit/a35159986f4cd8fc684895601407ceda8177ffab))
* **interactive:** handle snake_case properties in AI response ([a3cafc3](https://github.com/Seungwoo321/genai-sonar-lint/commit/a3cafc3f4ef10c2a71466b2b8a9cd177db381182))
* **providers:** improve response parsing for both Claude and Cursor ([7ccb20f](https://github.com/Seungwoo321/genai-sonar-lint/commit/7ccb20f9e5cf0f4ebb5e9dcd157e2783334d1597))
* **providers:** strip markdown code blocks from AI response ([104124c](https://github.com/Seungwoo321/genai-sonar-lint/commit/104124c4a66e1f3dc531085302512e2b4c2318c4))

### Documentation

* update CLI references and add new sections ([96bc59b](https://github.com/Seungwoo321/genai-sonar-lint/commit/96bc59b5cf1c7b6fa8fab94bf55f66eb0e84e3ea))

## [0.2.0](https://github.com/Seungwoo321/genai-sonar-lint/compare/v0.2.0-beta.0...v0.2.0) (2026-01-16)

## 0.2.0-beta.0 (2026-01-16)

### Features

* initial implementation of genai-sonar-lint CLI ([213f267](https://github.com/Seungwoo321/genai-sonar-lint/commit/213f2677f3117c338a8a50f9d2e109f69028e6d6))

### Bug Fixes

* add NODE_AUTH_TOKEN for npm publishing in workflow ([9afea2f](https://github.com/Seungwoo321/genai-sonar-lint/commit/9afea2f72bde341e3f794e6d4c97688251cfb7bf))
* add null safety checks for AI response data ([39e8097](https://github.com/Seungwoo321/genai-sonar-lint/commit/39e8097a59814190f8c8edea9506f4f98f449752))
