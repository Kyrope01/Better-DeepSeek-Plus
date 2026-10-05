# DeepSeek UI reference (recon for the native skin)

Collected 2026-10-05 from four independent sources. This is the ground truth the
extension's skin is built on — keep it in sync when DeepSeek ships a new look.

| Source | What it is | Where |
| --- | --- | --- |
| `deepseek-ai/deepseek-harness` → `packages/client/ui-theme/src/styles/design-platform.css` | the design platform's full token sheet, light + dark | `/home/user/ds/dsh-harness/ui-theme-styles/` (copy of the sparse clone) |
| `packages/client/ui-primitives/src/*.module.css` | component geometry (Button, Input, Menu, MenuSurface, Modal, SegmentedControl, Checkbox, …) | `/home/user/ds/dsh-harness/primitives/` |
| chat.deepseek.com compiled CSS (2025-09 snapshot + community mirror) | the live site's `ds-*` component rules: `.ds-button`, `.ds-input`, `.ds-textarea`, `.ds-switch`-family, `.ds-checkbox`, `.ds-radio-button-group`, `.ds-segmented`, `.ds-modal-content`, `.ds-dropdown-menu`, `.ds-tabs`, `.ds-tooltip`, `.ds-toast`, `.ds-skeleton` | `/home/user/ds/davidebizzocchi_DjangoMultiCat.css`, `/home/user/ds/onshinpei_ds-markdown.css` |
| Catppuccin userstyle v2026.08.16 for chat.deepseek.com | **current** token/class inventory the site responds to, incl. the theme hook | `/home/user/ds/catppuccin.less` |
| Live DOM dump of a chat page (2026) | current `ds-*` class names and inline token usage | `/home/user/ds/deepseek-dom.html` |

## 1. Theme hooks

* Dark: `body[data-ds-dark-theme]` (current) — also `body.dark`, `html.dark`,
  `html[data-theme=dark]` in other shells, and `prefers-color-scheme` as the last resort.
  Implemented once in `src/lib/page-theme.js` (`isPageDark`), used by the theme watcher,
  the HTML/PDF exporter and the chart renderer.
* Tokens are declared on **`<body>`** (and `body[data-ds-dark-theme]`), so any element
  inside `<body>` — including `#bds-root` — inherits them. `all: initial` does **not**
  reset custom properties.

## 2. Token families

| Family | Example names | Notes |
| --- | --- | --- |
| `--dsw-static-*` | `--dsw-static-neutral-bluish-850` | raw palette, same literals in both themes |
| `--dsw-alias-*` | `--dsw-alias-bg-layer-2`, `--dsw-alias-label-primary`, `--dsw-alias-border-l3`, `--dsw-alias-interactive-bg-hover`, `--dsw-alias-state-business-primary`, `--dsw-alias-button-primary-fill`, `--dsw-alias-switch-thumb` | semantic tokens, redefined per theme |
| `--dsw-specific-*` | `--dsw-specific-bubble`, `--dsw-specific-input-major`, `--dsw-specific-menu`, `--dsw-specific-sidebar-fill`, `--dsw-specific-selector`, `--dsw-specific-tip` | product surfaces |
| `--dsr-*` | `--dsr-bg`, `--dsr-text-0..4`, `--dsr-border-1/2`, `--dsr-main`, `--dsr-button-main-bg`, `--dsr-input-bg`, `--dsr-side-bg` | older app-shell tokens, still used by chat surfaces |
| `--ds-rgb-*` | `--ds-rgb-label-1/2/3`, `--ds-rgb-input`, `--ds-rgb-hover`, `--ds-rgb-separator(-strong)`, `--ds-rgb-primary`, `--ds-rgb-track/thumb`, `--ds-rgb-segmented*` | rgb trios; components read them through `rgb(var(--...))` |
| `--ds-*` base | `--ds-input-height-{l,m,s,xs}` 44/34/30/26px, `--ds-font-size-{l,m,sp,s,xsp,xs}` 16/14/13/12/11/10px, `--ds-line-height-*`, `--ds-ease-in-out`, `--ds-transition-duration` .2s, `--ds-input-border-radius` 10px, `--ds-font-weight-strong` 600 | geometry + motion |

## 3. Key values (2026 platform)

Light:

| Token | Value |
| --- | --- |
| `--dsw-alias-bg-base` / `-layer-1..3` | `#fff` |
| `--dsw-alias-label-primary` | `rgb(15 17 21)` |
| `--dsw-alias-label-secondary` | `rgb(97 102 107)` |
| `--dsw-alias-label-tertiary` | `rgb(129 133 140)` |
| `--dsw-alias-label-caption` | `rgb(173 178 184)` |
| borders l1→l4 | `rgba(0,0,0,.04 / .10 / .12 / .16)` |
| interactive hover / active | `rgba(38,49,72,.06)` / `rgba(38,49,72,.10)` |
| `--dsw-alias-button-primary-fill` (brand) | `rgb(15 17 21)` (near-black CTA) |
| `--dsw-alias-state-business-primary` | `rgb(65 118 230)` |
| `--dsw-specific-menu` | `rgba(248,249,250,.58)` |
| `--dsw-specific-sidebar-fill` | `rgb(249 250 251)` |

Dark:

| Token | Value |
| --- | --- |
| `--dsw-alias-bg-base` | `rgb(21 21 23)` |
| layers 1 / 2 / 3 | `rgb(35 35 36)` / `rgb(44 44 46)` / `rgb(53 54 56)` |
| `--dsw-alias-label-primary` | `rgb(249 250 251)` |
| secondary / tertiary / caption | `rgb(207 211 214)` / `rgb(173 178 184)` / `rgb(129 133 140)` |
| borders l1→l4 | `rgba(255,255,255,.06 / .12 / .16 / .20)` |
| interactive hover / active | `rgba(255,255,255,.08)` / `rgba(255,255,255,.14)` |
| `--dsw-alias-button-primary-fill` | `rgb(249 250 251)` |
| `--dsw-alias-state-business-primary` | `rgb(122 170 255)` |
| `--dsw-specific-menu` | `rgba(67,69,74,.45)` |
| `--dsw-specific-sidebar-fill` | `rgb(27 27 28)` |
| `--dsw-specific-bubble` / input-major | `rgb(44 44 46)` |

Legacy shell (still authoritative for chat surfaces): `--dsr-main #4d6bfe`;
dark `--dsr-bg #292a2d`, `--dsr-side-bg #212327`, `--dsr-input-bg #404045`,
`--dsr-input-border #5a5a69`, `--dsr-button-main-bg #509fff`.

## 4. Component metrics

* **Button** — heights 34 / 30 / 26 px from `--ds-input-height-*`, radius 10 px
  (xs 8 px), padding `0 14px`, font 14/25, disabled opacity .45, focus ring 2 px.
* **Icon button** — 18 px glyph, `-4px` inset hover plate (radius 8 px), :after ring radius 10 px.
* **Input / textarea** — filled `rgb(var(--ds-rgb-input))`, radius 10 px,
  `padding 6px 10px`; focus-within → `rgb(var(--ds-rgb-input-focus))` +
  `inset 0 0 0 2px rgb(var(--ds-rgb-primary))`; placeholder `label-3`.
* **Switch** — the site's contract is `--switch-color` / `--switch-thumb-color`
  (checked: accent track; dark thumb `rgb(173 178 184)`); 36×20 track, 16 px thumb.
* **Checkbox** — 16 px, radius 6 px, accent `--ds-rgb-primary`.
* **Menu** — `padding 4px`, elevated fill, radius 10 px, rows min 28 px / `8px 14px`,
  hover `rgb(var(--ds-rgb-hover))`, shadow `0 8px 24px rgba(0,0,0,.12)`.
* **Modal** — `.ds-modal-content`: width 525 px, radius **18 px**,
  padding `18px 21px 21px`, shadow `0 8px 24px rgba(0,0,0,.12)`, overlay `rgba(0,0,0,.24)`;
  title 18/24 weight 600.
* **Segmented** — radius 10 px, padding 2 px, item radius 8 px / `4px 14px`.
* **Tabs** — 32 px tall. **Toast** — radius 12 px, `11px 14px`.
* **Motion** — `0.2s cubic-bezier(0.4, 0, 0.2, 1)`; fast .1 s, slow .3 s.
* **Font stack** — system stack + `Segoe UI`, `PingFang SC`, `Hiragino Sans GB`,
  `Microsoft YaHei`, `Helvetica Neue`, Helvetica, Arial.

## 5. Class inventory worth knowing

Current (2026 DOM): `ds-theme`, `ds-message`, `ds-markdown`, `ds-markdown-paragraph`,
`ds-scroll-area` (+ `__gutters`, `__vertical-bar`, `--show-on-focus-within`),
`ds-virtual-list-visible-items`, `ds-icon`, `ds-focus-ring`, `ds-icon-button`
(+ `--m/--l/--disabled`, `__hover-bg`), `ds-toggle-button` (+ `--md/--selected`),
`ds-atom-button`, `ds-flex`, `ds-switch` (+ `--checked`), `ds-checkbox`,
`ds-radio-button-group`, `ds-basic-button` (+ `--primary`), `ds-tooltip`, `ds-input`,
`ds-textarea`, `ds-native-select`, `ds-form-item`, `ds-tabs`, `ds-modal-content`
(+ `--dialog`, `__main`, `__title`, `__footer`), `ds-dropdown-menu`
(+ `-option`, `-option__label`, `-option-divider`).

Layout shells use hashed CSS-module classes (`_6dbc175`, `_43c05b5`, `c99b79f8`, …) —
never target them; target `ds-*` + structure.

## 6. How the extension consumes all of this

* `src/styles/bds-theme.css` — primitive/alias fallbacks (light on `:root`, dark on
  `body[data-ds-dark-theme]`) and the `--bds-*` semantic layer, which reads in the order
  `--dsw-* → --dsr-* → --ds-rgb-* → literal`. Host declarations always win because they
  are nearer to our nodes.
* `src/styles/bds-components.css` — the control kit; every recipe above, expressed once.
* `src/styles/content.css` — structure/layout; legacy `--bds-*` names keep working.
* `src/lib/page-theme.js` — one light/dark detector for the whole extension.
* `src/content/ui/native-settings.js` — injects the extension's settings into DeepSeek's
  own Settings dialog (structure-classified, keep-alive, reversible);
  `NativeSettingsPanel.svelte` mounts the **same** components as the drawer
  (`SettingsPanel` + skills/characters/memory/projects/saved-items/commands), so the dialog
  and the drawer are two views of one settings surface.
