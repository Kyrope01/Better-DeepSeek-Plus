<script>
  /**
   * Better DeepSeek settings rendered INSIDE DeepSeek's own Settings dialog.
   *
   * This is the *whole* settings surface: it mounts the same components the
   * sidebar drawer uses — SettingsPanel (language, chat, prompt & memory,
   * projects, deep research, voice, integrations, utilities, custom CSS),
   * SkillList, CharacterList, MemoryList, projects, SavedItems and the command
   * manager — so everything the extension can configure is reachable where users
   * already go to change settings.
   *
   * Every component reads and writes `appState.settings` → `chrome.storage`
   * through the same path as the drawer, so the two surfaces can never drift:
   * the storage listener refreshes the drawer, and this panel refreshes itself
   * on `bds:settingsChanged`.
   *
   * Styling comes from the shared BDS token layer and control kit, which read
   * the page's own --dsw-* / --dsr-* variables, so the panel is painted exactly
   * like the dialog hosting it — in light, dark and any user site theme.
   */
  import { onMount } from "svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SkillList from "./SkillList.svelte";
  import CharacterList from "./CharacterList.svelte";
  import MemoryList from "./MemoryList.svelte";
  import SavedItems from "./SavedItems.svelte";
  import ProjectsCard from "./ProjectsCard.svelte";
  import ProjectsManager from "./ProjectsManager.svelte";
  import CommandManager from "../commands/CommandManager.svelte";
  import { STORAGE_KEYS } from "../../lib/constants.js";
  import { t } from "../../lib/i18n.svelte.js";
  import { getExtensionVersion } from "../../lib/extension-version.js";

  const version = getExtensionVersion();

  let settingsRef = $state(null);
  let skillsRef = $state(null);
  let charactersRef = $state(null);
  let memoriesRef = $state(null);
  let savedItemsRef = $state(null);
  let projectsManagerOpen = $state(false);
  let commandsOpen = $state(false);
  let savedFlash = $state(false);
  let floatingButton = $state(appState.settings.floatingButton === "always");
  let flashTimer = null;

  /** Pin (or release) the floating BDS button on the page. */
  function setFloatingButton(value) {
    floatingButton = value;
    appState.settings.floatingButton = value ? "always" : "auto";
    try {
      chrome.storage.local.set({
        [STORAGE_KEYS.settings]: JSON.parse(JSON.stringify(appState.settings)),
      });
    } catch (_) {
      // storage unavailable in some embedded contexts; the in-memory flag still applies
    }
  }

  /** Open the drawer's full-featured copy (kept for muscle memory and search). */
  function openInSidebar() {
    window.dispatchEvent(new CustomEvent("bds:open-settings"));
  }

  /** The API playground lives in the page shell; ask it to open. */
  function openApiPlayground() {
    window.dispatchEvent(new CustomEvent("bds:open-api-playground"));
  }

  /** Re-pull every list after a data import. */
  function refreshAll() {
    settingsRef?.refresh?.();
    skillsRef?.refresh?.();
    charactersRef?.refresh?.();
    memoriesRef?.refresh?.();
    savedItemsRef?.refresh?.();
  }

  function handleSaved() {
    savedFlash = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      savedFlash = false;
    }, 1600);
  }

  onMount(() => {
    const onSettingsChanged = () => settingsRef?.refresh?.();
    window.addEventListener("bds:settingsChanged", onSettingsChanged);
    return () => {
      window.removeEventListener("bds:settingsChanged", onSettingsChanged);
      clearTimeout(flashTimer);
    };
  });
</script>

<section class="bds-ns" aria-label="Better DeepSeek">
  <header class="bds-ns-header">
    <div class="bds-ns-heading">
      <span class="bds-ns-title">{t("drawer.title")}</span>
      <span class="bds-ns-version">{t("drawer.version", { version })}</span>
      {#if savedFlash}
        <span class="bds-ns-saved">{t("settings.autoSaved")}</span>
      {/if}
    </div>
    <button class="bds-btn-outlined bds-btn-sm" type="button" onclick={openInSidebar}>
      {t("settings.openInSidebar")}
    </button>
  </header>

  <p class="bds-ns-hint">{t("settings.nativeHint")}</p>

  <div class="bds-ns-row bds-ns-floating">
    <div class="bds-ns-label">
      <span>{t("settings.showFloatingButton")}</span>
      <small>{t("settings.showFloatingButtonHint")}</small>
    </div>
    <label class="bds-switch">
      <input
        type="checkbox"
        checked={floatingButton}
        onchange={(event) => setFloatingButton(event.currentTarget.checked)}
      />
      <span class="bds-switch-track"></span>
    </label>
  </div>
</section>

<!-- ── Full settings: identical to the sidebar drawer ── -->
<div class="bds-ns-panel">
  <SettingsPanel
    bind:this={settingsRef}
    onapiplayground={openApiPlayground}
    onimportdata={refreshAll}
    onsave={handleSaved}
  />
</div>

<hr class="bds-ns-sep" />

<!-- ── Skills ── -->
<SkillList bind:this={skillsRef} />

<hr class="bds-ns-sep" />

<!-- ── Characters ── -->
<CharacterList bind:this={charactersRef} />

<hr class="bds-ns-sep" />

<!-- ── Memory ── -->
<MemoryList bind:this={memoriesRef} />

<hr class="bds-ns-sep" />

<!-- ── Projects ── -->
{#if projectsManagerOpen}
  <ProjectsManager onback={() => (projectsManagerOpen = false)} />
{:else}
  <ProjectsCard onmanage={() => (projectsManagerOpen = true)} />
{/if}

<hr class="bds-ns-sep" />

<!-- ── Saved items / snippets / import & export ── -->
<SavedItems bind:this={savedItemsRef} />

<hr class="bds-ns-sep" />

<!-- ── Commands ── -->
{#if commandsOpen}
  <CommandManager onClose={() => (commandsOpen = false)} />
{:else}
  <button type="button" class="bds-btn-outlined bds-btn-sm" onclick={() => (commandsOpen = true)}>
    {t("commands.manage")}
  </button>
{/if}

<style>
  .bds-ns {
    display: block;
    padding: 4px 0 8px;
    color: var(--bds-text-primary);
    font-size: var(--bds-font-size-m);
    line-height: var(--bds-line-height-m);
  }

  .bds-ns-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0 8px;
  }

  .bds-ns-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .bds-ns-title {
    font-size: var(--bds-font-size-l);
    line-height: 24px;
    font-weight: var(--ds-font-weight-strong, 600);
    color: var(--bds-text-strong);
  }

  .bds-ns-version,
  .bds-ns-saved {
    font-size: var(--bds-font-size-s);
    color: var(--bds-text-tertiary);
  }

  .bds-ns-hint {
    margin: 0 0 4px;
    font-size: var(--bds-font-size-s);
    line-height: 18px;
    color: var(--bds-text-tertiary);
  }

  .bds-ns-floating {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0 4px;
  }

  .bds-ns-panel {
    display: block;
    padding-top: 8px;
  }

  .bds-ns-sep {
    height: 1px;
    margin: 20px 0;
    border: 0;
    background: var(--bds-divider);
  }
</style>
