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

1. Unzip `better-deepseek-chrome.zip` somewhere you will remember
   (e.g. `Documents\better-deepseek\`). You should end up with a folder that
   directly contains `manifest.json`, `content.js`, `content.css`, …
   *If you already have the source folder, you can use `dist-chrome/` as-is.*
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
2. After a second you should see a small **“BDS” pill in the top-right corner**
   of the page. Hovering shows *“Better DeepSeek — open settings”*.
   * Click it → the **sidebar drawer** slides in. This is the extension's full
   settings (language, chat, prompt & memory, deep research, voice,
   integrations, utilities, custom CSS).
   * Click outside it or press the toggle again to close.
3. Open DeepSeek's **own** settings: click your **avatar in the bottom-left** →
   **Settings** (on some layouts it is a gear icon at the bottom of the
   sidebar). At the end of the dialog you will find a **“Better DeepSeek”**
   section that contains **all** of the extension's settings — the same
   language/chat/prompt/research/voice/integrations/utilities/custom-CSS panel as
   the drawer, followed by skills, characters, memory, projects, saved items and
   the command manager. Change anything; a small *“Saved”* flash confirms it.
4. Check they agree: toggle **Show timestamps** in DeepSeek's dialog, then open
   the BDS drawer — the same switch is already on there. Both surfaces write to
   the same store, so they can never disagree.

### Quick pass/fail checklist

| # | Check | Expected |
|---|---|---|
| 1 | BDS pill visible, top-right, 34 px pill | ✔ |
| 2 | Drawer opens and looks like DeepSeek's own panel (same font, radius, colours) | ✔ |
| 3 | Drawer closes (toggle, ✕, outside click, `Esc`) | ✔ |
| 4 | “Better DeepSeek” section appears inside DeepSeek's Settings dialog and contains the full settings panel (scroll to the bottom of the dialog) | ✔ |
| 5 | A switch changed there survives a page reload | ✔ |
| 6 | With DeepSeek in **dark mode**, the pill/drawer/panel follow the dark theme | ✔ |
| 7 | No red errors in the browser console (see below) | ✔ |

---

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
| No BDS pill at all | Reload the DeepSeek tab; make sure the extension card is enabled and has no errors; check you are on `chat.deepseek.com` (not the marketing site). |
| Pill gone after changing code | Press the reload icon on the extension card, then refresh the tab. |
| No “Better DeepSeek” section in DeepSeek's Settings | DeepSeek may have changed its dialog markup. Note what the dialog looks like (screenshot) — the detector is designed to be adjusted. |
| Settings reset after removing the extension | Expected: removing an extension deletes its storage. Re-adding starts fresh. |
| Extension visible in an incognito window | You must enable “Allow in Incognito” on the extension card. |

## 7. For reference — where things live

| Thing | Path |
|---|---|
| Chrome build (load this folder) | `dist-chrome/` |
| Firefox build | `dist-firefox/` |
| Shareable archives | `better-deepseek-chrome.zip`, `better-deepseek-firefox.zip` |
| Android staging folder | `android/app/src/main/assets/bds/` |
| Local style preview (no browser extension needed) | `node scripts/serve-preview.js 8081` → open the preview |
| Full plan and design notes | `docs/PLAN-native-ui-and-settings.md`, `docs/deepseek-design-reference.md` |
