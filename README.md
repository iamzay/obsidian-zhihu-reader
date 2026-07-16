# Zhihu Reader

[中文版README](README_CN.md)

Read Zhihu questions and answers in a native reader view, then save only the
answers worth keeping as Markdown notes.

> Zhihu Reader is an unofficial project and is not affiliated with Zhihu.
> Changes to Zhihu APIs, authentication, or risk-control systems may
> temporarily affect some features.

## Features

- Render questions and answers through Obsidian's Markdown renderer.
- Search Zhihu answers and browse the daily hot list.
- Keep a local history of successfully opened questions.
- Read answer comments.
- Click an author avatar to browse that author's public answers.
- Vote for or unvote an answer.
- Save one answer per Markdown file.

## Screenshots
<img width="1260" height="914" alt="image" src="https://github.com/user-attachments/assets/ab02fa85-9d49-458b-896c-e23a4a5185ad" />

## Installation

### Community plugins

Once Zhihu Reader is available in the community plugin directory:

1. Open **Settings → Community plugins**.
2. Select **Browse** and search for **Zhihu Reader**.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this directory inside your vault:

   ```text
   <your-vault>/.obsidian/plugins/zhihu-reader/
   ```

3. Copy the three files into that directory.
4. Reload Obsidian.
5. Enable **Zhihu Reader** under **Settings → Community plugins**.

## Getting started

1. Enable **Web viewer** under **Settings → Core plugins**.
2. Open **Settings → Zhihu Reader**.
3. Sign in using one of the available methods.
4. Select the Zhihu Reader ribbon icon.
5. Select **Open link** in the reader toolbar and paste a supported URL.
6. Read the answer, move through the answer queue, or save the current answer.

You can also copy a supported URL and run the **Open from clipboard** command.

Supported URL formats:

```text
https://www.zhihu.com/question/QUESTION_ID
https://www.zhihu.com/question/QUESTION_ID/answer/ANSWER_ID
```

## Reading shortcuts

| Key | Action |
| --- | --- |
| `H` | Previous answer |
| `J` | Scroll down |
| `K` | Scroll up |
| `L` | Next answer |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Answers per request | `6` | Requests between 1 and 20 answers per feed page |
| Default answer order | Default ranking | Controls the initial question feed order |
| History limit | `50` | Maximum number of question history entries |
| Answer save folder | `Zhihu Reader` | Folder relative to the vault root |
| Note path template | Question/author/answer ID | Controls generated note paths |
| Open after saving | Enabled | Opens the generated Markdown note |
| Download images to the vault | Disabled | Downloads images only when saving |

When image downloading is enabled, attachments can follow the global
attachment setting or use a dedicated folder.

## Commands

The command palette provides commands for:

- Opening a Zhihu question or answer URL.
- Opening a Zhihu URL from the clipboard.
- Searching Zhihu answers.
- Opening the daily hot list.
- Opening question history.
- Saving the currently displayed answer.

Obsidian hotkeys can be assigned to any of these commands under
**Settings → Hotkeys**.

## Development

The project uses TypeScript, the Obsidian Plugin API, React, esbuild, Zod,
Turndown, Vitest, ESLint, and GitHub Actions.

Install dependencies and start a development build:

```bash
npm install
npm run dev
```

Run all checks before submitting a change:

```bash
npm run check
```

Project documentation:

- [Product requirements](docs/PRODUCT.md)
- [UI design](docs/UI-DESIGN.md)
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md)

## License

Zhihu Reader is released under the [MIT License](LICENSE).

## Acknowledgements

Special thanks to [Zhihu++](https://github.com/zly2006/zhihu-plus-plus) for its
open-source work. Its implementation was an important reference for
understanding Zhihu API request flows and helped make this project possible.
