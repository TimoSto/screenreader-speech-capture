<script lang="ts">
  import { THEMES, type Theme } from '#lib/core/theme.js';

  type Props = { value: Theme; onChange: (theme: Theme) => void };

  let { value, onChange }: Props = $props();
</script>

<fieldset>
  <legend>Color theme</legend>
  <p class="hint">Stored in this browser only. Applied immediately.</p>
  <div class="options">
    {#each THEMES as theme (theme.value)}
      <label class="option">
        <input
          type="radio"
          name="color-theme"
          value={theme.value}
          checked={value === theme.value}
          aria-describedby="theme-{theme.value}-description"
          onchange={() => onChange(theme.value)}
        />
        <span class="mark" aria-hidden="true"></span>
        <span class="swatch" data-theme={theme.value} aria-hidden="true">
          <span class="bar"></span>
          <span class="aa">Aa</span>
          <span class="chip"></span>
        </span>
        <span class="text">
          <span class="label">{theme.label}</span>
          <span class="description" id="theme-{theme.value}-description">{theme.description}</span>
        </span>
        <span class="selected" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Selected
        </span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
  }

  .hint {
    margin: 2px 0 12px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 13px;
    line-height: 18px;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 8px 16px 8px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: 12px;
    box-sizing: border-box;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
  }

  .option:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  /* The native radio stays the real control and covers the whole card. */
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 2px solid var(--md-sys-color-outline);
    border-radius: 50%;
    box-sizing: border-box;
  }

  .option:has(input:checked) {
    padding: 6px 14px 6px 10px;
    border: 3px solid var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .option:has(input:checked) .mark {
    border-color: var(--md-sys-color-primary);
  }

  .option:has(input:checked) .mark::after {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--md-sys-color-primary);
    content: '';
  }

  .option:has(input:focus-visible) {
    outline: var(--md-sys-state-focus-indicator-thickness) solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .label {
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  }

  .description {
    font-size: 13px;
    line-height: 18px;
  }

  .option:not(:has(input:checked)) .description {
    color: var(--md-sys-color-on-surface-variant);
  }

  .selected {
    display: none;
    align-items: center;
    gap: 4px;
    color: var(--md-sys-color-on-primary-container);
    font-size: 12px;
    font-weight: 600;
  }

  .option:has(input:checked) .selected {
    display: inline-flex;
  }

  /* Each swatch carries its own theme's tokens (tokens.css has bare [data-theme] selectors). */
  .swatch {
    position: relative;
    display: block;
    flex: none;
    width: 72px;
    height: 44px;
    border: 2px solid var(--md-sys-color-outline);
    border-radius: 8px;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--md-sys-color-surface);
  }

  .bar {
    position: absolute;
    inset: 0 0 auto;
    height: 10px;
    background: var(--md-sys-color-primary);
  }

  .aa {
    position: absolute;
    bottom: 5px;
    left: 8px;
    color: var(--md-sys-color-on-surface);
    font:
      600 15px/16px system-ui,
      sans-serif;
  }

  .chip {
    position: absolute;
    right: 7px;
    bottom: 7px;
    width: 20px;
    height: 12px;
    border-radius: 6px;
    background: var(--md-sys-color-primary);
  }

  /* On a narrow screen the decorative swatch makes room for the name and "Selected". */
  @media (max-width: 400px) {
    .swatch {
      display: none;
    }
  }
</style>
