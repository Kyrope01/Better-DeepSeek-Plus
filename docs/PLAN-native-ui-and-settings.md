# Better DeepSeek → native DeepSeek UI + settings inside DeepSeek's own settings

Status: **implementation plan** (approved direction from user request).
Scope: `src/styles/*`, `src/content/ui/*`, `src/content/theme.js`, `src/content/index.js`,
i18n locales, tests. No changes to the sidebar drawer's behaviour or markup contract.

---

## 1. Goal

1. **Exact same style as chat.deepseek.com.** Every BDS surface (drawer, toggle, menus,
   modals, cards, panels, overlays, toasts, code blocks, charts) must look like it was
   rendered by DeepSeek itself, in **both** themes, and must follow the site theme live —
   including when the user has a site-wide restyle (Catppuccin and friends) installed.
2. **Better DeepSeek settings inside DeepSeek's settings dialog.** Opening DeepSeek's own
   Settings shows a BDS section with all extension settings. The existing drawer stays
   exactly as it is today (same entry point, same features, same behaviour) and gains only
   the new skin.

## 2. Where the design truth comes from (recon, this session)

| Source | What it gives | Trust |
| --- | --- | --- |
| `chat.deepseek.com` DOM dump (`/home/user/ds/deepseek-dom.html`, 2026) | current class inventory: `ds-theme`, `ds-message`, `ds-markdown`, `ds-scroll-area(*)`, `ds-virtual-list*`, `ds-icon`, `ds-focus-ring`, `ds-icon-button`, `ds-toggle-button`, `ds-atom-button`; inline `--dsw-alias-label-primary` | **current** |
| Catppuccin userstyle for chat.deepseek.com, v2026.08.16 (`/home/user/ds/catppuccin.less`) | current token names the site responds to: full `--dsw-alias-*`, `--dsw-specific-*`, `--dsr-*`, `--ds-rgb-*`; theme hook `body[data-ds-dark-theme]` / `body:not([data-ds-dark-theme])`; control classes `ds-switch` (+`--checked`, `--switch-color`, `--switch-thumb-color`), `ds-checkbox`, `ds-basic-button--primary`, `ds-radio-button-group`, `ds-tooltip`, `ds-input` | **current** |
| chat.deepseek.com CSS mirror 2025-09 (`/home/user/ds/DeepSeekMain.b10de9fb40.css` partial + `davidebizzocchi_DjangoMultiCat.css`) | exhaustive component CSS: `.ds-button` (10px radius, 34/30/26px heights, fill/bordered/text variants), `.ds-input`, `.ds-textarea`, `.ds-switch`, `.ds-checkbox`, `.ds-radio-button-group`, `.ds-segmented`, `.ds-modal-content` (18px radius, `18px 21px 21px`, `0 8px 24px rgba(0,0,0,.12)`), `.ds-tooltip`, `.ds-toast`, `.ds-dropdown-menu` (4px pad, 28px rows), `.ds-form-item`, `.ds-tabs` | **site structure** |
| DeepSeek Harness platform sheet (`/home/user/ds/dsh-harness/ui-theme-styles/design-platform.css`, 2026) | literal values for every `--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*` token in light and dark, plus radii/motion | **current values** |
| Harness primitives (`/home/user/ds/dsh-harness/primitives/*.module.css`) | component geometry used by the 2026 platform: Button 36/28px r12, Input r12 `.5px` border on layer-1, Menu card pad 4 r12 min-w 144, Modal r28 on layer-2 + elevation, Segmented r12/r8 | **current values** |

Key structural facts:

* Tokens live on `<body>` / `body[data-ds-dark-theme]`. `#bds-root` is a child of `<body>`
  and `all: initial` does **not** reset custom properties ⇒ **every host token is already
  inherited by our UI** and follows the theme live. We must consume host tokens instead of
  hardcoding colours.
* The site hashes CSS-module class names for layout shells (`_6dbc175`, `_43c05b5`, …) and
  keeps stable `ds-*` classes for components. We therefore style with **our own class names
  expressed via the platform tokens** — never by copying hashed selectors — so we match the
  site exactly without breaking when hashes change.
* A site-wide restyle (Catppuccin etc.) overrides the same tokens, so token-driven UI
  automatically follows the user's skin. This is a hard requirement for "exact same style".

## 3. Token layer

`src/styles/bds-theme.css` (new, imported first in `src/content/index.js`):

* Re-exports the primitive palette as `--ds-rgb-*` trios and the platform statics as
  `--dsw-static-*` **only as fallbacks** (host wins), sourced from the 2026 platform sheet.
* Declares the full `--dsw-alias-*` / `--dsw-specific-*` light fallbacks on `:root` and dark
  fallbacks on `body[data-ds-dark-theme]`, `body.dark`, `html.dark`.
* Defines the BDS semantic layer every component uses:

  | BDS token | reads (in order) |
  | --- | --- |
  | `--bds-surface` | `--dsw-alias-bg-layer-2` → `--dsr-bg` → literal |
  | `--bds-surface-raised` | `--dsw-alias-bg-layer-1` → `--dsr-bg` |
  | `--bds-surface-subtle` | `--dsw-alias-button-floating-hover` → `--dsr-button-grey-1` |
  | `--bds-surface-control` | `--dsw-alias-button-elevated-fill` → `--dsr-button-grey-2` |
  | `--bds-surface-sidebar` | `--dsw-specific-sidebar-fill` → `--dsr-side-bg` |
  | `--bds-surface-menu` | `--dsw-specific-menu` |
  | `--bds-fill-hover` / `--bds-fill-active` | `--dsw-alias-interactive-bg-hover/-active` |
  | `--bds-text-strong/-primary/-secondary/-tertiary/-quaternary/-dimmed` | `--dsw-alias-label-primary/-secondary/-tertiary/-caption/-dimmed` → `--dsr-text-*` |
  | `--bds-text-on-accent` | `--dsw-alias-label-primary-foreground` |
  | `--bds-border` / `-subtle` / `-strong` / `-prominent` | `--dsw-alias-border-l2/-l1/-l3/-l4` |
  | `--bds-accent` / `-hover` / `-soft` | `--dsr-main` → `--dsw-alias-state-business-primary`; `--dsr-button-main-bg-hover`; `--dsr-button-second-bg` |
  | `--bds-danger` / `--bds-success` / `--bds-warning` | `--dsw-alias-state-*-primary` |
  | `--bds-input-bg` / `-strong` / `-border` | `--dsw-alias-bg-layer-1/-2`, `--dsw-alias-border-l4` |
  | `--bds-radius-*` | `--dsw-radius-xs/sm/md/lg/xl` with site recipe fallbacks (6/8/10/12/18) |
  | `--bds-shadow-menu/-modal/-soft` | platform elevation tokens |
  | `--bds-transition` | `--ds-transition-duration` + `--ds-ease-in-out` |
  | `--bds-focus-ring` | 2px platform ring in `--bds-accent` |
* Keeps **every legacy `--bds-*` name** alive (`--bds-bg-panel`, `--bds-bg-input`,
  `--bds-bg-hover`, `--bds-border`, `--bds-text-primary/secondary/tertiary`,
  `--bds-accent`, `--bds-accent-glow`, `--bds-danger*`, `--bds-radius`, `--bds-shadow`,
  `--bds-transition`, `--bds-bg-chat-user`, `--bds-bg-code`, …) mapped onto the new
  semantics, so the ~60 components and scoped styles get the native palette without
  per-file rewrites where colour alone was the problem.
* Adds native scrollbar skin and the platform font stack / body metrics on `#bds-root`.

## 4. Control kit

`src/styles/bds-components.css` (new, imported last so it wins):
buttons (filled primary / secondary / outlined / text / danger / xs·s·m sizes, focus ring
via `::after`), icon buttons, labels and settings rows (`--bds-toggle-row` with hairline
divider), inputs/textarea/select/native file input, switch (36×20, 16px thumb, accent when
checked, `--switch-color` / `--switch-thumb-color` variables so site skins keep working),
checkbox/radio, lists and cards (`--bds-skill-item`, `--bds-memory-item`, `--bds-card`),
menus, segmented control, section chrome, modal surfaces (radius 18, `18px 21px 21px`,
platform shadow) and the overlay scrim, badges, toasts, tooltips, skeletons.

Geometry follows the site: 34/30/26px control heights from `--ds-input-height-*`, 14/25
base type, radius from `--dsw-radius-*` (site fallback 10px for controls, 18px for modals),
`0.2s cubic-bezier(.4,0,.2,1)` motion, 2px focus ring.

## 5. Component sweep

1. **Global sheet** `src/styles/content.css` (5210 lines): token header replaced; the
   duplicated legacy token block deleted; toggle pill, drawer shell, drawer header, inputs,
   switch, buttons, tip bar, feature list, command list, tag pills, saved-search and help
   entries, export button and inline-editor shadow repainted through the new tokens (done in
   this pass). Remaining structural rules stay — the control kit loaded afterwards owns the
   final paint.
2. **Scoped component styles**: each Svelte `<style>` keeps its layout but swaps literal
   colours for tokens, priority on the components with the most literals:
   `ChartCard` (90), `VisualizerCard` (86), `PreviewPanel` (78), `MessageOverlay` (67),
   `DeepCodeToggle` (56), `QuestionPanel` (43), `LiveModeOverlay` (32), `QueuePanel` (30),
   `DeepResearchStatusCard` (30), `FileReadResultCard` (29), `DeepResearchPlanCard` (28),
   `DownloadCard` (25), `HarnessTaskCard` (23), `DirListResultCard` (23),
   `VisualizerFeedbackCard` (23), `SelectionOverlay` (17), `DeepResearchRevisionPanel` (17),
   `ImageCard` (15), `McpResultCard` (14), `RagPreview`/`TodoCard`/`Skeleton` (13), …
   plus the drawer-facing components (`Drawer.svelte`, `SettingsPanel.svelte`,
   `AttachMenu.svelte`, `ProjectsManager.svelte`, `MemoryImport.svelte`, dialogs).
3. **Toggle** `#bds-toggle`: floating chip (34px, pill, elevated surface, hairline border,
   hover fill, focus ring, no scale transform) — done in `content.css`.
4. **Drawer** `#bds-drawer`: modal card recipe (radius 18, platform shadow, `18px 21px
   21px`, 420px max width, native title 18/24 weight 600, native divider, native scrollbar)
   — shell done; section internals follow via tokens + kit.

## 6. Settings inside DeepSeek's Settings dialog

### 6.1 Mount strategy

* New module `src/content/ui/native-settings.js`, initialised from `src/content/index.js`
  next to `initSidebarMenuInjector()`.
* A `MutationObserver` on `document.body` (subtree) watches for the dialog. Every candidate
  frame matching `.ds-modal-content`, `.ds-modal`, `[role="dialog"]`, `[class*="modal" i]`
  that is not ours is classified:

  | signal | conclusion |
  | --- | --- |
  | contains ≥ 2 of `.ds-switch, .ds-basic-button, .ds-native-select, .ds-radio-button-group, .ds-checkbox, input[type=checkbox], select, [role="switch"]` | settings dialog |
  | contains `.ds-modal-content__footer .ds-button--primary` **and** a textarea | share dialog → skip |
  | our own `[data-bds-native-settings-root]` | skip |

* On a match, a host element (`<div class="bds-native-settings">`) is appended as the last
  child of the dialog's scroll area (`.ds-modal-content__main` → first scrollable child →
  the dialog body), marked with `data-bds-native-settings-root`, and the Svelte
  `NativeSettingsPanel` is mounted into it via `mount()` (same API as `mount.js`).
* **Keep-alive**: a lightweight interval plus the same observer re-inserts the host element
  if React removes it, and removes it when the dialog closes. Guards: it never re-runs while
  the element is connected (`el.isConnected`), and never observes our own subtree.
* **Entry points**: the site's own Settings dialog is the only surface — the extension
  adds no button, badge or menu row of its own. `openNativeSettings()` in
  `native-settings.js` (used by scripts/tests) finds the site's Settings entry by its
  visible wording (“Settings”, “设置”, “Настройки”, “Ayarlar”, “تنظیمات”), constrained to
  menu items inside the sidebar or a dropdown, and clicks the account button first when
  no menu is open.
* **Discovery** (markup-independent): a click on the site's own “Settings” entry opens a
  probe window, freshly added large elements are treated as dialog candidates, and an
  overlay/backdrop covering the viewport is unwrapped to the smallest descendant that has
  a rail or two controls. The panel is then appended to the dialog's content column (the
  area right of the rail) and the placement is *measured* — a host that reports a size but
  sits outside the card is rejected, and an accepted host is fitted to the free height with
  its own scroll so a short dialog cannot clip it out of sight.
* **Performance contract** (a real-account freeze taught this the hard way): observe
  `childList` plus a filtered attribute set only, debounce 150 ms, rate-limit 500 ms,
  bound every DOM walk (`MAX_NODES`), cache classification/rail per dialog, cap mount
  attempts per dialog, and do nothing while the tab is hidden. `__BDS_DIAG__.dump()`
  reports the state of every candidate dialog.
* The detector is designed around **structure, not text**, so it works in every locale.

### 6.2 Panel content

`src/content/ui/NativeSettingsPanel.svelte` mounts the **same components the drawer uses**,
so nowhere is a partial copy of the settings:

* A native header (“Better DeepSeek” + version badge + “Open in sidebar”), a hint line
  and the *Show the floating BDS button* switch (off by default — there is no floating
  button unless the user asks for one).
* `SettingsPanel.svelte` — the complete editor: language & locale, chat & messages,
  prompt & memory, projects & files, deep research, voice, integrations (search providers,
  MCP servers), utilities and custom CSS.
* `SkillList.svelte`, `CharacterList.svelte`, `MemoryList.svelte`, `ProjectsCard.svelte` /
  `ProjectsManager.svelte`, `SavedItems.svelte` (snippets + import/export) and the command
  manager — everything else the drawer offers.
* All components keep their own save paths (`appState.settings` → `chrome.storage`), and the
  panel re-reads on `bds:settingsChanged`, so the dialog and the drawer can never diverge.
* The panel is mounted when the site's dialog opens and unmounted with it; the drawer's
  markup contract is untouched.

## 7. i18n

New keys live in `messages.settings` in **all five** locales (English is the source of truth;
`node scripts/check-locales.js` must stay green):
`nativeHint`, `openInSidebar`, `deepFetchDepth`, `deepFetchDepthHint`.
Everything else reuses the drawer's existing keys (`drawer.title`, `drawer.version`,
`settings.*`, `mcp.*`, `commands.*`), which already exist in every locale.

## 8. Files

* New: `src/styles/bds-theme.css`, `src/styles/bds-components.css`,
  `src/content/ui/native-settings.js`, `src/content/ui/NativeSettingsPanel.svelte`,
  `docs/PLAN-native-ui-and-settings.md`, `docs/style-preview.html` (standalone preview page).
* Modified: `src/styles/content.css`, `src/content/index.js`, `src/content/theme.js`
  (theme hook extended to `body[data-ds-dark-theme]`), `src/locales/*.json`,
  every component listed in §5.2 (token sweep), `Drawer.svelte`, `SettingsPanel.svelte`.
* Untouched: drawer markup contract (`#bds-drawer`, `.bds-open/closed`, `#bds-close`,
  `.bds-drawer-header/body/bottom/footer`, `.bds-section-title`, `.bds-btn-outlined`,
  `.bds-featured-item`, `.bds-cmd-*`, `.bds-tip-bar`, `.bds-github-link`), background
  worker, injected hooks, parsers, Android bridge.

## 9. Verification

1. `npx vitest run` must stay green (baseline 110 files / 1681 tests, 5 known
   post-teardown rejections in `src/content/deep-research.js`).
2. `npm run build:chrome` (and `build:firefox`, `build:android`) must produce the same
   artefact set; CSS grows by the two new sheets; ASCII sanitiser stays green.
3. `node scripts/check-locales.js` must report no missing/extra keys.
4. `tests/e2e/widget-layout.spec.js` contracts re-checked by inspection: `#bds-toggle`
   visible top-right, `.bds-toggle-full` shown / `.bds-toggle-short` hidden at 1440px,
   `#bds-root` fixed, `aria-label="Better DeepSeek"`, `#bds-drawer.bds-open` — all preserved.
5. `docs/style-preview.html` (plain HTML, loads the built `content.css` + the mock chat
   markup and shows light/dark side by side) is served as the visual check; the real proof
   is loading the extension on chat.deepseek.com.

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Settings dialog markup differs per account/locale/version | structural classification + three trigger fallbacks; injection is additive and removable |
| React re-renders remove the injected section | keep-alive re-insert, marked host element, no dependency on React internals |
| Site renames tokens | every `var()` has a literal fallback from the 2026 platform sheet |
| Site restyles (Catppuccin) | we consume the same tokens ⇒ follow the skin automatically |
| Scoped Svelte styles beat global CSS | token swap inside each component; kit uses the same variable names |
| Double settings surfaces diverge | both render from the same store and save path |

## 11. Order of work — status

1. Token layer + control kit + `content.js` imports — **done**, build green.
2. Global sheet repaint + drawer/toggle shell — **done**; the drawer's markup and
   behaviour are unchanged (only its paint is tokenised).
3. Settings injection module + panel + i18n — **done**: `native-settings.js`
   (structural dialog classifier + keep-alive host) mounts `NativeSettingsPanel.svelte`
   into DeepSeek's own Settings dialog; `bds:open-settings` opens the drawer's full
   editor; all five locales carry the new keys (`check-locales.js` green).
4. Scoped-component token sweep — **done**: 671 literal colours replaced across 46
   Svelte `<style>` blocks (916 → 245 remaining literals, which are alpha overlays,
   shadows and file-type/provider brand colours), plus the `content.css` switch thumb,
   context ring, saved-type chips, command palette and help modal.
5. Preview page, tests, builds, docs — **done**: `docs/style-preview.html` now also
   previews the injected settings section; `npx vitest run` = 112 files / 1693 tests
   green; `npm run build` (chrome + firefox + android) green; `node scripts/check-locales.js`
   green; `docs/deepseek-design-reference.md` documents the token/component ground truth.

Only on-site verification remains: load the unpacked build on chat.deepseek.com, open the
account menu → Settings, and confirm the section mounts (and stays mounted) there.
