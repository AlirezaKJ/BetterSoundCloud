<script lang="ts">
  /*
   * The status line's words, in the one way the panel draws them (DESIGN.md, "The status
   * line"): the state in bold Ink, a full stop, the rest in Muted Ink — and a problem, when
   * there is one, on its own line in Ink. Used by Discord's line and by every plugin's.
   */
  type Props = { lead: string; detail?: string; problem?: string }
  let { lead, detail = '', problem = '' }: Props = $props()

  /** "Connected. Showing …": a full stop between the two, unless the lead ends in one. */
  const joiner = $derived(/[.…!?]$/.test(lead) ? ' ' : '. ')
</script>

<p><strong>{lead}</strong>{detail ? `${joiner}${detail}` : ''}</p>
{#if problem}
  <!-- Ink, not red: Danger Red is the close button's alone, and the words do the work. -->
  <p class="problem">{problem}</p>
{/if}

<style>
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  /* The state itself, in two or three words, is what a glance should catch. */
  strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .problem {
    margin-top: 4px;
    color: var(--bsc-text-primary);
  }
</style>
