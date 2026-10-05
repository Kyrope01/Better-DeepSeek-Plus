# How to test Better DeepSeek (step by step)

This guide assumes you have never loaded an extension before. Follow it top to
bottom; the whole thing takes about five minutes.

You need:

* a computer with **Chrome / Edge / Brave** (or **Firefox**),
* this project's files on that computer (the folder that contains
  `dist-chrome/`, `dist-firefox/` and the two `.zip` files),
* a **DeepSeek account** and a browser session on <https://chat.deepseek.com>.

> The extension is **not** on the Chrome Web Store, so it is installed in
> "developer mode" (a normal, safe way to load your own build). Nothing is
> uploaded anywhere; every setting is stored in your own browser profile.

---

## 1. Chrome / Edge / Brave (recommended)

1. Get `better-deepseek-chrome.zip` — it is committed at the **root of the
   repository**, so you can download it straight from GitHub
   (`Code` → the file in the file list → *Download raw file*), or use the copy
   sitting next to this guide in the project folder.
   Unzip it somewhere you will remember (e.g. `Documents\better-deepseek\`).
   You should end up with a folder that directly contains `manifest.json`,
   `content.js`, `content.css`, …
   *If you already have the source folder, you can use `dist-chrome/` as-is.*
   *The zip is rebuilt and committed on every change, so re-download it
   (or rebuild with `npm run build:chrome`) to pick up fixes.*
2. Open a new tab and go to: **`chrome://extensions`**
   (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** — the switch in the **top-right corner**.
4. Click **Load unpacked** (top-left).
5. Select the folder from step 1 — the one that contains `manifest.json`.
6. The card **Better DeepSeek 0.1.15** appears. That's it — there is no toolbar
   icon to pin; the extension draws its own button on the DeepSeek page.

## 2. Firefox

1. Go to **`about:debugging#/runtime/this-firefox`**.
2. Click **Load Temporary Add-on…**.
3. Pick `manifest.json` **inside** `dist-firefox/`.
4. That works immediately, but Firefox forgets temporary add-ons when it
   restarts — just repeat these three steps after a restart. (A permanent
   install needs Mozilla signing, which is outside this project.)

---

## 3. First run — what you should see

1. Open <https://chat.deepseek.com> and sign in. **Reload the page once** after
   installing, so the content script can attach.
2. **No button or badge is added to the page.** Everything lives in DeepSeek's own
   Settings dialog:
   * click your **avatar (bottom-left)** → **Settings**;
   * the dialog opens with General / Profile / Data / About — **scroll it** and you
     will find a **“Better DeepSeek”** section holding *all* of the extension's
     settings: language, chat, prompt & memory, projects, deep research, voice,
     integrations, utilities and custom CSS, followed by skills, characters,
     memory, projects, saved items and the command manager;
   * change anything there — a small *“Saved”* flash confirms it, and the same
     value is used everywhere in the extension.
3. Prefer the old sidebar drawer? Turn on **“Show the floating BDS button”** (the
   switch at the top of that section) and a corner button appears; clicking it
   opens the drawer, which shows the very same settings full-height.

### Quick pass/fail checklist

| # | Check | Expected |
|---|---|---|
| 1 | No BDS button or badge added anywhere on the page | ✔ |
| 2 | Avatar → **Settings** opens normally — no freeze, no delay | ✔ |
| 3 | Scrolling the dialog reveals the **“Better DeepSeek”** section with the full panel | ✔ |
| 4 | A setting changed there shows *“Saved”* and survives a page reload | ✔ |
| 5 | The *Show the floating BDS button* switch brings the corner button back, and it opens the drawer | ✔ |
| 6 | With DeepSeek in **dark mode**, the injected panel follows the dark theme | ✔ |
| 7 | No red errors in the browser console (see below) | ✔ |

## 4. Testing light / dark and third-party themes

* DeepSeek's theme switch is next to your avatar / in Settings. Flip it while
  the drawer is open — everything should re-paint instantly, with no white
  flash or black text on a black card.
* If you use a third-party restyle (for example the **Catppuccin** userstyle
  for chat.deepseek.com), enable it and reload. The extension reads DeepSeek's
  own theme variables, so it follows that palette too. If anything does **not**
  follow it, that is a bug worth reporting (see §6).

## 5. Updating after the code changes

After any change, the build must be refreshed and the browser told to reload:

```bash
npm install          # only the first time
npm run build        # builds Chrome + Firefox into dist-chrome/ and dist-firefox/
```

* Chrome: `chrome://extensions` → on the Better DeepSeek card press the
  **circular reload icon**, then refresh the DeepSeek tab.
* Using the committed zip instead? Download the new
  `better-deepseek-chrome.zip`, unzip over/replace the old folder, then press the
  same reload icon.
* Firefox: remove the old temporary add-on and load it again (§2).
* The ready-to-share archives `better-deepseek-chrome.zip` and
  `better-deepseek-firefox.zip` are rewritten by every build.

Android (only if you build the wrapper app):

```bash
npm run build:android   # copies the bundle into android/app/src/main/assets/bds
```

then build/install the app from `android/` with Android Studio.

---

## 6. If something looks wrong

Useful things to capture — these make a fix almost immediate:

1. **A screenshot** of the page with the problem visible.
2. The **Console**: press `F12` → tab **Console** → reload the page → copy any
   line that starts with `[BDS`, `Uncaught`, or is shown in red.
3. The **extension errors**: `chrome://extensions` → the Better DeepSeek card →
   **Errors** button → copy the text.
4. What you did last (e.g. “opened avatar → Settings; the panel appeared but
   stayed empty”).

Typical fixes:

| Symptom | Fix |
|---|---|
| No “Better DeepSeek” section in DeepSeek's Settings | Open the console (`F12`), open Settings, and run `__BDS_DIAG__.force()` — it clears the caches and retries immediately, then prints what it sees. If the section still does not appear, send the output of `copy(JSON.stringify(__BDS_DIAG__.dump(), null, 1))` (it lists every dialog, its resolved card, size, controls, rail and mount state) and detection can be pinned to your exact markup. |
| The page feels slow or frozen when a dialog opens | Please report it at once with the console open. The scanner is debounced, rate-limited and bounded by design, so the page should never block. |
| No BDS pill in the corner | Correct — there is none by default. The settings are in DeepSeek's own menu. |
| Want the old sidebar drawer | Turn on *Show the floating BDS button* inside the panel, or run `__BDS_UI__.openDrawer()` in the console. |
| Settings reset after removing the extension | Expected: removing an extension deletes its storage. Re-adding starts fresh. |
| Extension visible in an incognito window | You must enable “Allow in Incognito” on the extension card. |

## 7. For reference — where things live

| Thing | Path |
|---|---|
| Chrome build (load this folder) | `dist-chrome/` |
| Firefox build | `dist-firefox/` |
| Quick-test archive (committed in Git) | `better-deepseek-chrome.zip` at the repository root |
| Other archives | `better-deepseek-firefox.zip` (local build output, not committed) |
| Android staging folder | `android/app/src/main/assets/bds/` |
| Local style preview (no browser extension needed) | `node scripts/serve-preview.js 8081` → open the preview |
| Full plan and design notes | `docs/PLAN-native-ui-and-settings.md`, `docs/deepseek-design-reference.md` |
