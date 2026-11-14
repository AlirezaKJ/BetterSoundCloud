<script lang="ts">
  /*
   * An on/off setting that applies at once: a switch, as Windows 11 and macOS settings draw one
   * (chosen by the maintainer, 2026-11-14). Squared, not a pill: the track has the controls' 6px
   * corners and the knob 3px, which is the track's radius less the 3px between them, so the
   * corners are concentric rather than a third radius (DESIGN.md, the Two Radii Rule). A real
   * checkbox underneath, with `role="switch"`, so the keyboard and screen readers get a switch.
   */
  let {
    id,
    checked,
    disabled = false,
    label,
    onchange
  }: {
    id: string
    checked: boolean
    disabled?: boolean
    /** Only when no `<label for>` names it. */
    label?: string
    /** The new state, and the box itself, for a caller that must put it back (asking first). */
    onchange: (checked: boolean, input: HTMLInputElement) => void
  } = $props()
</script>

<input
  {id}
  type="checkbox"
  role="switch"
  class="switch"
  data-bsc-switch
  {checked}
  {disabled}
  aria-label={label}
  onchange={(e) => onchange(e.currentTarget.checked, e.currentTarget)}
/>

<style>
  /* Off: an outlined track and a muted knob on the left, as Windows draws it. On: the accent,
     which marks state, with a white knob on the right. */
  .switch {
    position: relative;
    flex: 0 0 auto;
    width: 34px;
    height: 20px;
    margin: 0;
    border: 1px solid var(--bsc-text-secondary);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    appearance: none;
    cursor: pointer;
  }

  .switch::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--bsc-text-secondary);
    transition: transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .switch:checked {
    border-color: var(--bsc-accent);
    background: var(--bsc-accent);
  }

  /* White on the accent in both modes, like the close button's glyph on its red. */
  .switch:checked::before {
    background: #fff;
    transform: translateX(14px);
  }

  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .switch::before {
      transition: none;
    }
  }

  /* A contrast theme: the system's own colours, kept exact so the state still shows. */
  @media (forced-colors: active) {
    .switch {
      forced-color-adjust: none;
      border-color: CanvasText;
      background: Canvas;
    }

    .switch::before {
      background: CanvasText;
    }

    .switch:checked {
      border-color: Highlight;
      background: Highlight;
    }

    .switch:checked::before {
      background: HighlightText;
    }
  }
</style>
