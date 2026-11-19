<script>
  import UserRow from './UserRow.svelte';
  import NoteRow from './NoteRow.svelte';
  import ExtRow from './ExtRow.svelte';
  import ExtDialogRow from './ExtDialogRow.svelte';
  import MarkdownRow from './MarkdownRow.svelte';
  import ThinkRow from './ThinkRow.svelte';
  import ToolRow from './ToolRow.svelte';

  export let row;
</script>

{#if row.kind === 'user'}
  <UserRow {row} />
{:else if row.kind === 'note'}
  <NoteRow {row} />
{:else if row.kind === 'ext'}
  <ExtRow {row} />
{:else if row.kind === 'dialog'}
  <ExtDialogRow {row} />
{:else if row.kind === 'think'}
  <ThinkRow {row} />
{:else if row.kind === 'tool'}
  <ToolRow {row} />
{:else}
  <MarkdownRow {row} />
{/if}
