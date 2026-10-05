<script>
  /**
   * Better DeepSeek inside DeepSeek's own Settings dialog.
   *
   * This view replaces the dialog's content area (the site's own tab rail gets a
   * "Better DeepSeek" entry to switch back to it, and clicking any other entry
   * returns to that page). It is organised as **categories** so everything fits
   * the dialog instead of being one enormous scroll:
   *
   *   • Settings categories map to the sections of the shared SettingsPanel
   *     (`sectionFilter`), which keeps one editor for both surfaces.
   *   • Library categories mount the very components the drawer uses (skills,
   *     characters, memory, projects, saved items, commands).
   *
   * Wherever a value is edited, it is written through the same store as the
   * drawer (`appState.settings` → `chrome.storage`), so both views stay in sync.
   */
  import { onMount } from "svelte";
  import appState from "../state.js";
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

  /** Categories backed by sections of the shared settings editor. */
  const SETTINGS_CATEGORIES = [
    { id: "chat", labelKey: "settings.subChat", sections: ["subChat"] },
    { id: "language", labelKey: "settings.subLanguage", sections: ["subLanguage"] },
    { id: "prompts", labelKey: "settings.subInjection", sections: ["subInjection"] },
    { id: "files", labelKey: "settings.subProjects", sections: ["subProjects"] },
    { id: "research", labelKey: "settings.subResearch", sections: ["subResearch"] },
    { id: "voice", labelKey: "settings.subVoice", sections: ["subVoice"] },
    { id: "tools", labelKey: "settings.subIntegrations", sections: ["subIntegrations", "subMcp"] },
    { id: "utilities", labelKey: "settings.subUtilities", sections: ["subUtilities"] },
    { id: "css", labelKey: "settings.subCSS", sections: ["subCSS"] },
  ];

  /** Categories that open one of the drawer's own list components. */
  const LIBRARY_CATEGORIES = [
    { id: "skills", labelKey: "skillList.title" },
    { id: "characters", labelKey: "characterList.title" },
    { id: "memory", labelKey: "memoryList.title" },
    { id: "projects", labelKey: "projectsCard.title" },
    { id: "saved", labelKey: "savedItems.title" },
    { id: "commands", labelKey: "commands.title" },
  ];

  const CATEGORIES = [
    ...SETTINGS_CATEGORIES.map(({ id, labelKey }) => ({ id, labelKey })),
    ...LIBRARY_CATEGORIES,
  ];

  let active = $state("chat");
  let savedFlash = $state(false);
  let flashTimer = null;
  let settingsRef = $state(null);
  let skillsRef = $state(null);
  let charactersRef = $state(null);
  let memoriesRef = $state(null);
  let savedItemsRef = $state(null);
  let projectsManagerOpen = $state(false);

  let floatingButton = $state(appState.settings.floatingButton === "always");

  const activeSections = $derived(
    SETTINGS_CATEGORIES.find((category) => category.id === active)?.sections ?? null
  );

  /** Pin (or release) the floating BDS button on the page. */
  function setFloatingButton(value) {
    floatingButton = value;
    appState.settings.floatingButton = value ? "always" : "auto";
    window.dispatchEvent(new CustomEvent("bds:floating-button-changed", { detail: value }));
    try {
      chrome.storage.local.set({
        [STORAGE_KEYS.settings]: JSON.parse(JSON.stringify(appState.settings)),
      });
    } catch (_) {
      // storage unavailable in some embedded contexts; the in-memory flag still applies
    }
  }

  /** The full-height side panel, for anyone who prefers it. */
  function openInSidebar() {
    window.dispatchEvent(new CustomEvent("bds:open-settings"));
  }

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
    const onSettingsChanged = () => {
      settingsRef?.refresh?.();
      floatingButton = appState.settings.floatingButton === "always";
    };
    window.addEventListener("bds:settingsChanged", onSettingsChanged);
    return () => {
      window.removeEventListener("bds:settingsChanged", onSettingsChanged);
      clearTimeout(flashTimer);
    };
  });
</script>

<div class="bds-native-panel" data-bds-native-panel>
  <header class="bds-np-header">
    <div class="bds-np-heading">
      <span class="bds-np-title">{t("drawer.title")}</span>
      <span class="bds-np-version">v{version}</span>
      {#if savedFlash}
        <span class="bds-np-saved">{t("settings.autoSaved")}</span>
      {/if}
    </div>
    <label class="bds-np-float" title={t("settings.showFloatingButtonHint")}>
      <span>{t("settings.showFloatingButtonShort")}</span>
      <span class="bds-switch bds-switch--sm">
        <input
          type="checkbox"
          checked={floatingButton}
          onchange={(event) => setFloatingButton(event.currentTarget.checked)}
        />
        <span class="bds-switch-track"></span>
      </span>
    </label>
    <button class="bds-btn-text bds-btn-xs" type="button" onclick={openInSidebar}>
      {t("settings.openInSidebar")}
    </button>
  </header>

  <nav class="bds-np-tabs" aria-label={t("drawer.title")}>
    {#each CATEGORIES as category (category.id)}
      <button
        type="button"
        class="bds-np-tab"
        class:bds-np-tab--active={active === category.id}
        aria-current={active === category.id ? "page" : undefined}
        onclick={() => (active = category.id)}
      >
        {t(category.labelKey)}
      </button>
    {/each}
  </nav>

  <div class="bds-np-body">
    {#if activeSections}
      <SettingsPanel
        bind:this={settingsRef}
        sectionFilter={activeSections}
        onapiplayground={() => window.dispatchEvent(new CustomEvent("bds:open-api-playground"))}
        onimportdata={refreshAll}
        onsave={handleSaved}
      />
    {:else if active === "skills"}
      <SkillList bind:this={skillsRef} />
    {:else if active === "characters"}
      <CharacterList bind:this={charactersRef} />
    {:else if active === "memory"}
      <MemoryList bind:this={memoriesRef} />
    {:else if active === "projects"}
      {#if projectsManagerOpen}
        <ProjectsManager onback={() => (projectsManagerOpen = false)} />
      {:else}
        <ProjectsCard onmanage={() => (projectsManagerOpen = true)} />
      {/if}
    {:else if active === "saved"}
      <SavedItems bind:this={savedItemsRef} />
    {:else if active === "commands"}
      <CommandManager onClose={() => (active = "chat")} />
    {/if}
  </div>
</div>

<style>
  .bds-native-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--bds-text-primary);
    font-family: inherit;
  }

  .bds-np-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 0 10px;
    border-bottom: 1px solid var(--bds-divider);
    flex: none;
  }

  .bds-np-heading {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .bds-np-title {
    font-size: var(--bds-font-size-l);
    line-height: 24px;
    font-weight: var(--ds-font-weight-strong, 600);
    color: var(--bds-text-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bds-np-version,
  .bds-np-saved {
    font-size: var(--bds-font-size-s);
    color: var(--bds-text-tertiary);
    white-space: nowrap;
  }

  .bds-np-float {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    font-size: var(--bds-font-size-s);
    color: var(--bds-text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  /* Category chips: as many rows as needed, never wider than the dialog. */
  .bds-np-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 0;
    flex: none;
  }

  .bds-np-tab {
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--bds-border);
    border-radius: var(--bds-radius-md);
    background: transparent;
    color: var(--bds-text-secondary);
    font-family: inherit;
    font-size: var(--bds-font-size-s);
    line-height: 1;
    cursor: pointer;
    transition: background-color var(--bds-transition), color var(--bds-transition),
      border-color var(--bds-transition);
    white-space: nowrap;
  }

  .bds-np-tab:hover {
    background: var(--bds-fill-hover);
    color: var(--bds-text-primary);
  }

  .bds-np-tab--active {
    background: var(--bds-fill-active);
    border-color: transparent;
    color: var(--bds-text-primary);
    font-weight: var(--ds-font-weight-strong, 600);
  }

  /* The one scrolling region: the dialog size never changes with the content. */
  .bds-np-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px 2px 8px 0;
  }
</style>
