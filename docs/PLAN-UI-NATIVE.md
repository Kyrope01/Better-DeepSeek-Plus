# Better DeepSeek — Native UI Redesign Plan

Status: **implementation plan** (approved direction from user request on 2026-10-05).
Owner: Arena agent session `arena/01a10a96-better-deepseek-plus`.

---

## 1. Goal

1. Make the extension's UI **visually indistinguishable from DeepSeek's own web app** — same
   tokens, same component geometry, same motion, same typography. Today it looks "AI-generated":
   heavy blue slabs, 8px radii everywhere, `transform: scale()` hovers, ad-hoc greys, a light
   panel that ignores the host theme.
2. Make **all Better DeepSeek settings reachable inside DeepSeek's own Settings dialog**, so users
   no longer have to open the sidebar drawer.
3. **Keep the sidebar drawer exactly as functional as it is today** (same entry, same features) —
   it only gets the native skin; nothing is removed.

---

## 2. Where the design truth comes from (recon, 2026-10-05)

| Source | What it gives us |
| --- | --- |
| `chat.deepseek.com` compiled CSS (archived copy, mirrored in `davidebizzocchi/DjangoMultiCat`) | `--dsr-*` semantic tokens **light + dark**, `--ds-rgb-*` palette refs, and the real `.ds-button`, `.ds-dropdown-menu`, `.ds-segmented`, `.ds-form-item`, `.ds-checkbox`, `.ds-radio-button`, `.ds-textarea`, `.ds-modal-content`, `.ds-toast`, `.ds-tooltip` rules |
| `onshinpei/ds-markdown` `src/defined.less` (copy of the app's token sheet) | full `--ds-rgb-*` primitive palette (neutral/zinc/slate/gray/blue/red/green/amber/…), typography scale (`--ds-font-size-*`, `--ds-line-height-*`), input heights, easings, code font |
| `deepseek-ai/deepseek-harness` (official repo, `packages/client/ui-theme`, `ui-primitives`) | current `--dsw-*` design-platform tokens (light + `body[data-ds-dark-theme]`), `--dsw-radius-*`, `--dsw-elevation-*`, focus-ring contract, and official React primitive CSS (Button/Input/Switch/Modal/Menu/Toast/Tooltip) |
| Live 2026 DOM snapshot (input bar) | current component classes: `ds-atom-button`, `ds-toggle-button(--selected/--md)`, `ds-icon-button(--m/--l, __hover-bg)`, `ds-scroll-area`, `ds-virtual-list-visible-items`, `ds-theme`, `ds-focus-ring` |

Key facts that drive the implementation:

* The host defines its tokens on **`<body>`** (and `body[data-ds-dark-theme]` for dark). The
  extension root `#bds-root` is a child of `<body>` and `all: initial` does **not** reset custom
  properties, so **every DeepSeek token is already inherited by our UI** and stays in sync when
  the user flips the theme. We must consume them instead of hardcoding colours.
* `--dsr-main: #4d6bfe`, `--dsr-button-main-bg: var(--dsr-main)`, hover `#4166d5` — this is the
  chat app's *productive* accent (send button, primary CTA). The `--dsw-alias-brand-primary`
  black/white contrast button belongs to the DSH desktop product, **not** the website.
* Dark theme chat background is `#292a2d` (`--dsr-bg`), sidebar `#212327`, inputs `#404045`
  with `#5a5a69` borders; light background is white, sidebar `#f9fbff`, inputs `gray-100`.
* Component geometry: buttons 34 px tall (`.ds-button--m`, radius 10 px, padding 0 14 px, 14/25 px),
  small 30 px / 12 px (radius 10 px), dropdown menus radius 10 px with 28 px rows,
  segmented control radius 10 px/8 px with 2 px padding, modals radius 18 px with
  `0 8px 24px rgba(0,0,0,.12)` and `18px 21px 21px` padding, icon buttons 18 px glyph with a
  `-4px` inset hover plate (radius 8 px), toasts radius 12 px, transitions
  `0.2s cubic-bezier(0.4, 0, 0.2, 1)`, focus ring `0 0 0 2px` in the primary colour.

---

## 3. Token layer (foundation)

New file **`src/styles/bds-theme.css`**, imported before `content.css`.

### 3.1 Primitive + semantic fallbacks

We re-declare the *fallback* values (never overriding the host, which is nearer in the cascade):
`--bds-rgb-*` primitives for the scales we use, and BDS semantic tokens that read the host first:

```css
:root {
  /* host tokens win; literals are the 2026-10 chat.deepseek.com values */
  --bds-color-bg:        var(--dsr-bg, #fff);
  --bds-color-text-0:    var(--dsr-text-0, #000);
  --bds-color-text-1:    var(--dsr-text-1, rgb(38 38 38));
  --bds-color-text-2:    var(--dsr-text-2, rgb(82 82 82));
  --bds-color-text-3:    var(--dsr-text-3, rgb(163 163 163));
  --bds-color-border-1:  var(--dsr-border-1, rgb(187 187 187));
  --bds-color-border-2:  var(--dsr-border-2, rgb(229 229 229));
  --bds-color-primary:   var(--dsr-main, #4d6bfe);
  --bds-color-primary-hover: var(--dsr-button-main-bg-hover, #4166d5);
  --bds-color-hover:     rgb(var(--ds-rgb-hover, 245 245 245));
  --bds-color-input-bg:  var(--dsr-input-bg, rgb(243 244 246));
  --bds-color-input-border: var(--dsr-input-border, #dce0e9);
  ...
}
body[data-ds-dark-theme], body.dark, html.dark { /* dark fallbacks */ }
```

### 3.2 Legacy aliases (instant restyle for every existing component)

The current code uses ~55 `--bds-*` names. They are re-pointed at the new semantic tokens so
*all* markup styled by `content.css` becomes native without touching each component:

| Old token | New value |
| --- | --- |
| `--bds-bg-panel` / `--bds-bg-input` | `rgb(var(--ds-rgb-elevated, 255 255 255))` |
| `--bds-bg-elevated` | `rgb(var(--ds-rgb-input, 245 245 245))` |
| `--bds-bg-hover` | `rgb(var(--ds-rgb-hover, …))` |
| `--bds-border` / `--bds-border-hover` | `rgb(var(--ds-rgb-separator))` / `rgb(var(--ds-rgb-separator-strong))` |
| `--bds-text-primary/secondary/tertiary` | `--dsr-text-1` / `--dsr-text-2` / `--dsr-text-3` |
| `--bds-accent` | `var(--dsr-main, #4d6bfe)` (button blue, not the old flat fill) |
| `--bds-accent-glow` | `color-mix(in srgb, var(--bds-accent) 14%, transparent)` |
| `--bds-danger` | `rgb(var(--ds-rgb-error, 239 68 68))` |
| `--bds-radius` | `12px` (native card/menu radius), panels `18px` |
| `--bds-shadow` | `0 8px 24px rgba(0,0,0,.12)` (native modal shadow) |
| `--bds-bg-chat-user` | `rgb(var(--ds-rgb-input))` |
| `--bds-transition` | `0.2s cubic-bezier(0.4, 0, 0.2, 1)` |

Typography: `#bds-root` adopts `font-size: var(--ds-font-size-m, 14px)`,
`line-height: var(--ds-line-height-m, 25px)` and the host font stack
(`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", …`).

### 3.3 Native component classes

New file **`src/styles/bds-components.css`** implements the `.ds-*` look under the `bds-` prefix
(so we never fight host specificity and never depend on hashed class names). Every class is a
1:1 port of the measured site CSS:

* `.bds-btn` (+ `--primary`, `--secondary`, `--bordered`, `--text`, `--danger`, `--s`, `--xs`,
  `--block`, `--icon`) — heights 34/30/26 px, radius 10 px, hover fills, `:focus-visible` ring,
  `--disabled` opacity .45.
* `.bds-icon-btn` — 18/20 px glyph, `-4px` hover plate radius 8 px, focus plate radius 10 px.
* `.bds-input`, `.bds-textarea` — filled+focus-ring variants, placeholder `label-3`,
  focus `inset 0 0 0 2px var(--dsr-main)` or border-color swap.
* `.bds-switch` — 36×20 track, thumb 16 px, checked `var(--dsr-main)`, unchecked
  `rgb(var(--ds-rgb-input))`, 0.2 s ease-in-out.
* `.bds-checkbox`, `.bds-radio` — native 16 px, accent `--dsr-main`.
* `.bds-menu` / `.bds-menu-item` — radius 10 px card, 28 px rows, hover `rgb(var(--ds-rgb-hover))`,
  divider `rgb(var(--ds-rgb-separator))`.
* `.bds-segmented` (+ `.bds-segmented-item[aria-selected]`), `.bds-tabs` — radius 10/8 px, 2 px pad.
* `.bds-card`, `.bds-list-item`, `.bds-row` (settings row: title + description + control),
  `.bds-section-title` (14 px/600), `.bds-caption` (12 px `label-3`), `.bds-divider`.
* `.bds-toast`, `.bds-tooltip`, `.bds-badge`, `.bds-skeleton`, `.bds-spinner`.

---

## 4. Component-by-component work

1. **`content.css` (5 227 lines)** — keep the file as the single global stylesheet, but:
   * delete the duplicated `:root`/dark theme blocks (now in `bds-theme.css`);
   * rewrite the control sections (labels, inputs, switch, buttons, lists, tip bar, menus) against
     `bds-components.css` classes;
   * replace every hardcoded `#fff`/`#333`/`rgba(...)` literal that belongs to the chrome with the
     new tokens; keep deliberate accents (syntax colours, language badges, chart palettes).
2. **Scoped component styles** (Svelte `<style>` blocks compile to `.svelte-<hash>` and outrank
   plain global rules): the ~20 components that carry hardcoded literals get their palettes
   replaced by tokens — priority order by literal count:
   `ChartCard` (90), `VisualizerCard` (86), `PreviewPanel` (78), `MessageOverlay` (67),
   `DeepCodeToggle` (56), `QuestionPanel` (43), `LiveModeOverlay` (32), `QueuePanel` (30),
   `FileReadResultCard` (29), `DeepResearchPlanCard`/`StatusCard` (28/30), `DownloadCard` (25),
   `HarnessTaskCard` (23), `DirListResultCard`/`VisualizerFeedbackCard`/`DeepResearchStepDoneCard` (23/23/18),
   `SelectionOverlay` (17), `DeepResearchRevisionPanel` (17), `ImageCard` (15), `McpResultCard` (14),
   `RagPreview`/`TodoCard`/`Skeleton` (13), plus the remaining long tail.
3. **Drawer** — becomes a native surface: 18 px radius, `0 8px 24px rgba(0,0,0,.12)` shadow,
   `18px 21px 21px` padding, native title (18 px/600), native `.bds-icon-btn` close, native
   dividers, native scrollbar (`--dsr-border-2` thumb), native section headers. Content order
   unchanged (Settings → Skills → Characters → Memory → Projects → Saved → Commands → tips →
   GitHub footer).
4. **Toggle pill `#bds-toggle`** — native floating control: height 34 px, radius 999 px,
   `rgb(var(--ds-rgb-elevated))` fill, 1 px `--dsr-border-2` border, `--dsr-text-1` label,
   hover `rgb(var(--ds-rgb-hover))`, focus ring, no `scale()` hover.
5. **Overlays/modals** (`DeepCodeModal`, `MemoryImport`, `AddDirectoryModal`, `SnippetDialog`,
   `ConfirmDialog`, `WhatsNewModal`, …, `ApiPlayground`) — 18 px radius, native shadow,
   native modal header/footer rhythm, native buttons.
6. **Result cards** (Download/Pptx/Excel/Docx/Image/Search/DirList/FileRead/Mcp/Todo/Chart/
   Visualizer/Harness) — one shared card recipe (`surface + 1px separator + 12px radius +
   native typography`) replacing the current mix of borders, gradients and capsule badges.

---

## 5. Settings inside DeepSeek's Settings dialog

### 5.1 Approach

Inject a **native-looking "Better DeepSeek" section** into the live Settings modal and render the
existing settings UI inside it. The drawer keeps its own copy (single source of truth: both mount
the same Svelte component).

### 5.2 Detection (`src/content/ui/native-settings.js`)

1. `MutationObserver` on `document.body` + a 1 s interval fallback (the modal can mount before the
   observer attaches, e.g. on a route change).
2. Candidate scan, scored structurally (never by text, so it works in all locales):
   * `.ds-modal-content` / `[role="dialog"]` / `.ds-modal-wrapper .ds-modal`;
   * must contain ≥ 2 control groups (`.ds-switch`, `[role="switch"]`, `.ds-checkbox`,
     `input[type=checkbox]`, `.ds-segmented`, `select`);
   * excludes our own dialog (`data-bds-native-settings`) and known non-settings dialogs
     (share dialog: contains `.ds-modal-content__footer .ds-button--primary` + textarea; confirm
     dialogs: `--dialog` width class without controls).
3. Remember the matched element in a `WeakSet` so re-renders don't re-run detection, and cache the
   *path signature* (class list of the dialog + container) to re-find it after React replaces nodes.

### 5.3 Mounting + React safety

* Container: `div#bds-native-settings[data-bds-native-settings]`, inserted as the **first child of
  the dialog's scroll pane** — pane resolution order:
  `.ds-modal-content__main` → first descendant with `overflow-y: auto|scroll` → the direct child of
  `.ds-modal-content` that is not the header wrapper.
* `mount(NativeSettingsPanel, …)` into it (Svelte 5 `mount()` API, same as `mount.js`).
* A reconciliation loop (rAF, throttled) re-appends the container if React removes it, and hides it
  if the pane is detached — mirroring the proven `host.js` child-host pattern.
* The section is collapsible (chevron) and starts expanded on first open; state persists in
  `chrome.storage.local` under `bds.nativeSettingsCollapsed`.
* Fallbacks when nothing matches after 6 s, or when the user disables the feature: a native-styled
  row injected into the account dropdown (`.ds-dropdown-menu`, the proven `SidebarMenuInjector`
  seam) labelled **"Better DeepSeek"** that opens the drawer; plus a "Open DeepSeek Settings"
  helper button in the drawer when the feature is enabled but not yet detected.

### 5.4 Component reuse

* Split `SettingsPanel.svelte` into `SettingsPanel.svelte` (unchanged public API for the drawer)
  and the presentational body it already contains, so `NativeSettingsPanel.svelte` can render the
  same groups in a compact, embedded layout (no sticky footer, native section rows, per-section
  save affordance removed in favour of the existing auto-save + explicit save button).
* New i18n strings (added to **all five** locales so `npm run check-locales` stays green):
  `settings.embeddedTitle`, `settings.embeddedHint`, `settings.openInSidebar`.

---

## 6. Files touched (expected)

* New: `src/styles/bds-theme.css`, `src/styles/bds-components.css`,
  `src/content/ui/NativeSettingsPanel.svelte`, `src/content/ui/native-settings.js`,
  `docs/PLAN-UI-NATIVE.md` (this file), `docs/deepseek-design-reference.md`.
* Modified: `src/styles/content.css`, `src/content/index.js` (init the bridge),
  `src/content/ui/Drawer.svelte`, `SettingsPanel.svelte` (+ the ~25 components listed in §4),
  `src/locales/*.json`, `build.js` only if a new stylesheet entry is needed
  (it is not — `content.css` `@import`s the two new files, and Vite inlines them).
* Untouched: background worker, injected hook, parsers, all feature logic, Android shell wiring.

---

## 7. Verification

1. `npm run build:chrome` must stay green (ASCII sanitiser included).
2. `npx vitest run` — 1 681 tests are the current baseline; any assertion that depends on styling
   classes must keep passing (checked `tests/e2e/widget-layout.spec.js` uses
   `#bds-toggle`, `#bds-root`, `#bds-drawer`, `bds-open/closed` — all preserved).
3. `npm run check-locales` after i18n edits.
4. Local preview harness: build a small static page with the copied DeepSeek token sheet + the
   mock chat shell and the built `content.css`, served in the Arena preview so the user can see
   the new skin in light **and** dark without installing anything.
5. Playwright e2e cannot run in this sandbox (no browser binaries, CDN blocked) — documented, not
   a regression.

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Host renames `ds-*` tokens | Every `var()` has a literal 2026-10 value; BDS semantic layer is self-sufficient |
| React removes our injected node | rAF reconciler re-appends; container keyed by attribute, never by React state |
| Settings modal structure differs per account/locale | Structural scoring + multiple selector fallbacks + menu-entry fallback, never text matching |
| Svelte scoped styles beat global CSS | Token swap covers 90 %; the rest is edited inside each component's `<style>` |
| Dark-theme regressions | Both themes are first-class in the token layer; demo harness renders both |
| Bundle growth | Two extra CSS files, no new JS dependencies |

## 9. Order of work

1. Token + component stylesheets, wire into `content.css`, verify build.
2. Global `content.css` control sections → native.
3. Drawer + toggle + overlays.
4. Scoped component palettes (priority order in §4.2).
5. Native settings bridge + embedded panel + i18n + fallbacks.
6. Docs, demo harness, full test run, changelog entry.
