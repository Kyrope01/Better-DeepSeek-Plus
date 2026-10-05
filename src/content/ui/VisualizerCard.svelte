<script>
  import { onMount, onDestroy } from "svelte";
  import { t } from "../../lib/i18n.svelte.js";
  import { buildVisualizerDocument } from "../../lib/utils/html-utils.js";
  import { sendPromptToChat } from "../auto.js";

  /** @type {{content: string, onopenpanel?: (srcdoc: string) => void}} */
  let { content, onopenpanel = () => {} } = $props();

  let iframeElement = $state(null);
  let hasError = $state(false);
  let errorDetails = $state(null);

  let showMenu = $state(false);
  let selectedOption = $state("buggy");
  let otherText = $state("");
  let isSending = $state(false);
  let sendFailed = $state(false);

  $effect(() => {
    if (content) {
      hasError = false;
      errorDetails = null;
      showMenu = false;
      sendFailed = false;
      selectedOption = "buggy";
      otherText = "";
    }
  });

  let iframeSrcDoc = $derived(buildVisualizerDocument(content));

  function handleMessage(event) {
    if (event.data && event.data.type === "BDS_VISUALIZER_ERROR") {
      if (iframeElement && event.source === iframeElement.contentWindow) {
        hasError = true;
        errorDetails = event.data;
      }
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
  });

  onDestroy(() => {
    window.removeEventListener("message", handleMessage);
  });

  function openInPanel() {
    onopenpanel(iframeSrcDoc);
  }

  function handleFeedbackBtnClick() {
    if (hasError) {
      sendErrorPrompt();
    } else {
      showMenu = !showMenu;
    }
  }

  async function sendErrorPrompt() {
    if (isSending) return;
    isSending = true;

    const msg = errorDetails?.message || "Unknown runtime error";
    const line = errorDetails?.lineno != null ? `Line: ${errorDetails.lineno}` : "";
    const col = errorDetails?.colno != null ? `Col: ${errorDetails.colno}` : "";
    const stack = errorDetails?.stack ? `\nStack Trace:\n${errorDetails.stack}` : "";

    const promptText = `<BDS:VISUALIZER_FEEDBACK type="runtime_error" reason="Visualizer Runtime Error">
A runtime error occurred in the Visualizer code:
Error: ${msg}
${line} ${col}${stack}

Please fix the error and regenerate the <BDS:VISUALIZER> code.
</BDS:VISUALIZER_FEEDBACK>`;

    try {
      const ok = await sendPromptToChat(promptText, "Visualizer Error Feedback");
      if (!ok) sendFailed = true;
    } finally {
      isSending = false;
    }
  }

  async function handleSubmitMenuFeedback() {
    if (isSending) return;
    isSending = true;

    let reasonLabel = "";
    if (selectedOption === "buggy") {
      reasonLabel = t("visualizerCard.optionBuggy");
    } else if (selectedOption === "blank") {
      reasonLabel = t("visualizerCard.optionBlank");
    } else if (selectedOption === "other") {
      reasonLabel = `${t("visualizerCard.optionOther")}: ${otherText.trim() || t("visualizerCard.otherEmptyFallback")}`;
    }

    const promptText = `<BDS:VISUALIZER_FEEDBACK type="user_report" reason="${reasonLabel.replace(/"/g, '&quot;')}">
A Visualizer issue was reported:
Reason: ${reasonLabel}
Please consider the issue and regenerate the <BDS:VISUALIZER> code.
</BDS:VISUALIZER_FEEDBACK>`;

    try {
      const ok = await sendPromptToChat(promptText, "Visualizer User Feedback");
      if (ok) {
        showMenu = false;
      } else {
        sendFailed = true;
      }
    } finally {
      isSending = false;
    }
  }
</script>

<div class="bds-visualizer-card">
  <header class="bds-visualizer-header">
    <div class="bds-visualizer-header-left">
      <h4>{t('visualizerCard.title')}</h4>
      <p>{t('visualizerCard.subtitle')}</p>
    </div>
    <div class="bds-visualizer-header-actions">
      <button 
        class="bds-visualizer-feedback-btn" 
        class:error={hasError}
        class:warning={!hasError}
        onclick={handleFeedbackBtnClick} 
        title={hasError ? t('visualizerCard.reportErrorTooltip') : t('visualizerCard.reportWarningTooltip')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if hasError}
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          {:else}
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          {/if}
        </svg>
        <span>{hasError ? t('visualizerCard.runtimeError') : t('visualizerCard.reportIssue')}</span>
      </button>

      <button class="bds-visualizer-panel-btn" onclick={openInPanel} title={t('visualizerCard.openInPanel')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
        </svg>
        {t('visualizerCard.openInPanel')}
      </button>
    </div>
  </header>

  {#if showMenu && !hasError}
    <div class="bds-visualizer-menu">
      <div class="bds-menu-header">
        <div class="bds-menu-title-row">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span class="bds-menu-title">{t('visualizerCard.reportIssue')}</span>
        </div>
        <button class="bds-menu-close-btn" onclick={() => (showMenu = false)}>✕</button>
      </div>

      <div class="bds-menu-options">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'buggy'}
          onclick={() => (selectedOption = 'buggy')}
        >
          <input type="radio" id="viz-opt-buggy" name="viz-reason" value="buggy" bind:group={selectedOption} />
          <label for="viz-opt-buggy">{t('visualizerCard.optionBuggy')}</label>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'blank'}
          onclick={() => (selectedOption = 'blank')}
        >
          <input type="radio" id="viz-opt-blank" name="viz-reason" value="blank" bind:group={selectedOption} />
          <label for="viz-opt-blank">{t('visualizerCard.optionBlank')}</label>
        </div>

        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
          class="bds-menu-option-card" 
          class:active={selectedOption === 'other'}
          onclick={() => (selectedOption = 'other')}
        >
          <input type="radio" id="viz-opt-other" name="viz-reason" value="other" bind:group={selectedOption} />
          <label for="viz-opt-other">{t('visualizerCard.optionOther')}</label>
        </div>
      </div>

      {#if selectedOption === 'other'}
        <textarea
          class="bds-menu-textarea"
          bind:value={otherText}
          placeholder={t('visualizerCard.otherPlaceholder')}
          rows="2"
        ></textarea>
      {/if}

      {#if sendFailed}
        <p class="bds-menu-error">{t('visualizerCard.sendFailed')}</p>
      {/if}

      <div class="bds-menu-actions">
        <button class="bds-menu-cancel" onclick={() => (showMenu = false)}>{t('visualizerCard.cancel')}</button>
        <button class="bds-menu-submit" onclick={handleSubmitMenuFeedback} disabled={isSending}>
          {t('visualizerCard.sendAndRegenerate')}
        </button>
      </div>
    </div>
  {/if}

  <div class="bds-visualizer-body">
    <iframe
      bind:this={iframeElement}
      class="bds-visualizer-frame"
      title={t('visualizerCard.title')}
      sandbox="allow-scripts allow-forms"
      srcdoc={iframeSrcDoc}
    ></iframe>
  </div>
</div>

<style>
  .bds-visualizer-card {
    border: 1px solid var(--bds-border, var(--bds-border-strong));
    border-radius: 8px;
    background: var(--bds-bg-panel, var(--bds-surface));
    padding: 12px;
    margin: 10px 0;
    font-family: inherit;
    color: var(--bds-text-primary, var(--bds-text-primary));
    height: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bds-visualizer-header {
    margin-bottom: 8px;
    border-bottom: 1px solid var(--bds-border, var(--bds-border));
    padding-bottom: 6px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .bds-visualizer-header-left {
    min-width: 0;
  }

  .bds-visualizer-header-left h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    color: var(--bds-accent);
    letter-spacing: 0.05em;
  }

  .bds-visualizer-header-left p {
    margin: 0;
    font-size: 10px;
    color: var(--bds-text-secondary);
  }

  .bds-visualizer-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bds-visualizer-feedback-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .bds-visualizer-feedback-btn.warning {
    border: 1px solid var(--bds-warning-soft);
    background: var(--bds-warning-soft);
    color: var(--bds-warning);
  }

  .bds-visualizer-feedback-btn.warning:hover {
    background: var(--bds-warning-soft);
    border-color: var(--bds-warning);
    box-shadow: 0 2px 6px var(--bds-warning-soft);
  }

  .bds-visualizer-feedback-btn.error {
    border: 1px solid var(--bds-danger-soft);
    background: var(--bds-danger-soft);
    color: var(--bds-danger);
  }

  .bds-visualizer-feedback-btn.error:hover {
    background: var(--bds-danger-soft);
    border-color: var(--bds-danger);
    box-shadow: 0 2px 6px var(--bds-danger-soft);
  }

  .bds-visualizer-panel-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--bds-border, var(--bds-border-strong));
    border-radius: 6px;
    background: transparent;
    color: var(--bds-text-primary, #000);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .bds-visualizer-panel-btn:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
    border-color: var(--bds-accent, var(--bds-accent));
    color: var(--bds-accent, var(--bds-accent));
  }

  /* ── Sleek Popover Menu ── */
  .bds-visualizer-menu {
    border: 1px solid var(--bds-border, var(--bds-border));
    border-radius: 10px;
    background: var(--bds-bg-panel, var(--bds-surface));
    color: var(--bds-text-primary, var(--bds-text-primary));
    padding: 12px 14px;
    margin-bottom: 10px;
    font-size: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    animation: bdsMenuFade 0.15s ease-out;
  }

  @keyframes bdsMenuFade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bds-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bds-menu-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bds-menu-title {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: -0.01em;
  }

  .bds-menu-close-btn {
    border: none;
    background: transparent;
    color: var(--bds-text-tertiary, var(--bds-text-tertiary));
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .bds-menu-close-btn:hover {
    color: var(--bds-text-primary, var(--bds-text-primary));
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
  }

  .bds-menu-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bds-menu-option-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--bds-border, var(--bds-border));
    border-radius: 7px;
    background: var(--bds-bg, var(--bds-surface-subtle));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bds-menu-option-card:hover {
    background: var(--bds-bg-hover, var(--bds-surface-subtle));
    border-color: var(--bds-warning-soft);
  }

  .bds-menu-option-card.active {
    border-color: var(--bds-warning);
    background: var(--bds-warning-soft);
  }

  .bds-menu-option-card input[type="radio"] {
    accent-color: var(--bds-warning);
    cursor: pointer;
    margin: 0;
  }

  .bds-menu-option-card label {
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    flex-grow: 1;
    user-select: none;
  }

  .bds-menu-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--bds-border, var(--bds-border-strong));
    border-radius: 7px;
    font-family: inherit;
    font-size: 11px;
    background: var(--bds-bg, var(--bds-surface));
    color: inherit;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }

  .bds-menu-textarea:focus {
    border-color: var(--bds-warning);
    box-shadow: 0 0 0 2px var(--bds-warning-soft);
  }

  .bds-menu-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }

  .bds-menu-cancel {
    padding: 5px 12px;
    border: 1px solid var(--bds-border, var(--bds-border-strong));
    border-radius: 6px;
    background: transparent;
    color: var(--bds-text-primary, var(--bds-border-strong));
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .bds-menu-cancel:hover {
    background: var(--bds-bg-hover, rgba(0,0,0,0.05));
  }

  .bds-menu-submit {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, var(--bds-warning), var(--bds-warning));
    color: var(--bds-surface);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 5px var(--bds-warning-soft);
    transition: all 0.15s ease;
  }

  .bds-menu-submit:hover {
    background: linear-gradient(135deg, var(--bds-warning), #b45309);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px var(--bds-warning-soft);
  }

  .bds-menu-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .bds-menu-error {
    color: var(--bds-danger);
    font-size: 11px;
    margin: 0;
  }

  .bds-visualizer-body {
    flex-grow: 1;
    overflow: hidden;
  }

  .bds-visualizer-frame {
    width: 100%;
    height: 100%;
    border: 1px solid var(--bds-border, var(--bds-border-strong));
    background: var(--bds-surface);
    display: block;
    overflow: hidden;
    border-radius: 6px;
  }

  .bds-visualizer-frame::-webkit-scrollbar {
    display: none;
  }:global(body[data-ds-dark-theme]) .bds-visualizer-card,
  :global(body.dark) .bds-visualizer-card,
  :global(html.dark) .bds-visualizer-card {
    background: var(--bds-text-primary);
    border-color: var(--bds-text-primary);
    color: var(--bds-surface-subtle);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-header-left h4,
  :global(body.dark) .bds-visualizer-header-left h4,
  :global(html.dark) .bds-visualizer-header-left h4 {
    color: var(--bds-text-strong);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-header-left p,
  :global(body.dark) .bds-visualizer-header-left p,
  :global(html.dark) .bds-visualizer-header-left p {
    color: var(--bds-text-tertiary);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-panel-btn,
  :global(body.dark) .bds-visualizer-panel-btn,
  :global(html.dark) .bds-visualizer-panel-btn {
    border-color: #444;
    color: var(--bds-text-primary, var(--bds-surface-subtle));
  }:global(body[data-ds-dark-theme]) .bds-visualizer-panel-btn:hover,
  :global(body.dark) .bds-visualizer-panel-btn:hover,
  :global(html.dark) .bds-visualizer-panel-btn:hover {
    background: rgba(255,255,255,0.08);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-feedback-btn.warning,
  :global(body.dark) .bds-visualizer-feedback-btn.warning,
  :global(html.dark) .bds-visualizer-feedback-btn.warning {
    border-color: var(--bds-warning-soft);
    background: var(--bds-warning-soft);
    color: var(--bds-warning);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-feedback-btn.warning:hover,
  :global(body.dark) .bds-visualizer-feedback-btn.warning:hover,
  :global(html.dark) .bds-visualizer-feedback-btn.warning:hover {
    background: var(--bds-warning-soft);
    border-color: var(--bds-warning);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-feedback-btn.error,
  :global(body.dark) .bds-visualizer-feedback-btn.error,
  :global(html.dark) .bds-visualizer-feedback-btn.error {
    border-color: var(--bds-danger-soft);
    background: var(--bds-danger-soft);
    color: var(--bds-danger);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-feedback-btn.error:hover,
  :global(body.dark) .bds-visualizer-feedback-btn.error:hover,
  :global(html.dark) .bds-visualizer-feedback-btn.error:hover {
    background: var(--bds-danger-soft);
    border-color: var(--bds-danger);
  }:global(body[data-ds-dark-theme]) .bds-visualizer-menu,
  :global(body.dark) .bds-visualizer-menu,
  :global(html.dark) .bds-visualizer-menu {
    background: var(--bds-text-primary);
    border-color: var(--bds-surface-raised);
    color: var(--bds-surface-subtle);
  }:global(body[data-ds-dark-theme]) .bds-menu-option-card,
  :global(body.dark) .bds-menu-option-card,
  :global(html.dark) .bds-menu-option-card {
    background: var(--bds-surface-raised);
    border-color: var(--bds-surface-raised);
  }:global(body[data-ds-dark-theme]) .bds-menu-option-card:hover,
  :global(body.dark) .bds-menu-option-card:hover,
  :global(html.dark) .bds-menu-option-card:hover {
    background: var(--bds-surface-raised);
  }:global(body[data-ds-dark-theme]) .bds-menu-option-card.active,
  :global(body.dark) .bds-menu-option-card.active,
  :global(html.dark) .bds-menu-option-card.active {
    border-color: var(--bds-warning);
    background: var(--bds-warning-soft);
  }:global(body[data-ds-dark-theme]) .bds-menu-textarea,
  :global(body.dark) .bds-menu-textarea,
  :global(html.dark) .bds-menu-textarea {
    background: var(--bds-bg);
    border-color: var(--bds-surface-raised);
    color: var(--bds-surface-subtle);
  }:global(body[data-ds-dark-theme]) .bds-menu-cancel,
  :global(body.dark) .bds-menu-cancel,
  :global(html.dark) .bds-menu-cancel {
    border-color: var(--bds-border-strong);
    color: var(--bds-text-tertiary);
  }:global(body[data-ds-dark-theme]) .bds-menu-cancel:hover,
  :global(body.dark) .bds-menu-cancel:hover,
  :global(html.dark) .bds-menu-cancel:hover {
    background: var(--bds-surface-raised);
    color: var(--bds-surface-subtle);
  }
</style>