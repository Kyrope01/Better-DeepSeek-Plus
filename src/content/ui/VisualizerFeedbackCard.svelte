<script>
  import { t } from "../../lib/i18n.svelte.js";

  /** @type {{type?: string, reason?: string, content?: string}} */
  let { type = "user_report", reason = "", content = "" } = $props();

  let showDetails = $state(false);

  let isRuntimeError = $derived(type === "runtime_error" || type === "error");
  let statusColor = $derived(isRuntimeError ? "#ef4444" : "#f59e0b");
  let title = $derived(
    isRuntimeError
      ? (t('visualizerCard.runtimeErrorTitle') || "Visualizer Runtime Error")
      : (t('visualizerCard.feedbackTitle') || "Visualizer Feedback")
  );

  function toggleDetails() {
    showDetails = !showDetails;
  }
</script>

<article class="bds-feedback-card" style="--status-color: {statusColor}">
  <div class="bds-feedback-header">
    <div class="bds-feedback-info">
      <div class="bds-feedback-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          {#if isRuntimeError}
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          {:else}
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          {/if}
        </svg>
      </div>
      <div class="bds-feedback-details">
        <h4>{title}</h4>
        {#if reason}
          <p>{reason}</p>
        {:else}
          <p>{t('visualizerCard.sentToAi') || "Sent to AI for regeneration"}</p>
        {/if}
      </div>
    </div>

    <div class="bds-feedback-actions">
      {#if content && content.trim()}
        <button type="button" class="bds-btn-text" onclick={toggleDetails}>
          {showDetails ? (t('autoCodeResult.hideOutput') || "Hide ▴") : (t('autoCodeResult.showOutput') || "Details ▾")}
        </button>
      {/if}
    </div>
  </div>

  {#if showDetails && content && content.trim()}
    <div class="bds-feedback-content">
      <pre>{content.trim()}</pre>
    </div>
  {/if}
</article>

<style>
  .bds-feedback-card {
    margin: 8px 0;
    border: 1px solid var(--bds-border, var(--bds-border));
    border-radius: 12px;
    background: var(--bds-bg-panel, var(--bds-surface));
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .bds-feedback-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
  }

  .bds-feedback-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bds-feedback-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background-color: var(--bds-bg-elevated, var(--bds-surface-subtle));
    border: 1px solid var(--bds-border, var(--bds-border));
    border-radius: 8px;
    color: var(--status-color);
    flex-shrink: 0;
  }

  .bds-feedback-details h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--bds-text-primary, var(--bds-text-primary));
  }

  .bds-feedback-details p {
    margin: 2px 0 0 0;
    font-size: 11px;
    color: var(--bds-text-tertiary, var(--bds-text-secondary));
  }

  .bds-btn-text {
    background: transparent;
    border: none;
    color: var(--bds-text-tertiary, var(--bds-text-secondary));
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }

  .bds-btn-text:hover {
    color: var(--bds-text-secondary, var(--bds-text-primary));
  }

  .bds-feedback-content {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--bds-border, var(--bds-border));
    background: rgba(0,0,0,0.01);
  }:global(body[data-ds-dark-theme]) .bds-feedback-card,
  :global(body.dark) .bds-feedback-card,
  :global(html.dark) .bds-feedback-card {
    background: var(--bds-text-primary);
    border-color: var(--bds-surface-raised);
    color: var(--bds-surface-subtle);
  }:global(body[data-ds-dark-theme]) .bds-feedback-icon,
  :global(body.dark) .bds-feedback-icon,
  :global(html.dark) .bds-feedback-icon {
    background-color: var(--bds-surface-raised);
    border-color: var(--bds-surface-raised);
  }:global(body[data-ds-dark-theme]) .bds-feedback-content,
  :global(body.dark) .bds-feedback-content,
  :global(html.dark) .bds-feedback-content {
    background: rgba(255,255,255,0.01);
  }

  .bds-feedback-content pre {
    margin: 0;
    max-height: 140px;
    overflow-y: auto;
    background: var(--bds-bg-elevated, var(--bds-surface-subtle));
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;
    border: 1px solid var(--bds-border, var(--bds-border));
    font-family: monospace;
    white-space: pre-wrap;
    color: var(--bds-text-secondary, var(--bds-text-primary));
  }:global(body[data-ds-dark-theme]) .bds-feedback-content pre,
  :global(body.dark) .bds-feedback-content pre,
  :global(html.dark) .bds-feedback-content pre {
    background: var(--bds-bg);
    border-color: var(--bds-surface-raised);
    color: var(--bds-border-strong);
  }
</style>
