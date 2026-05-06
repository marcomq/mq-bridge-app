<script lang="ts">
  import MountedNode from "./MountedNode.svelte";

  interface Props {
    label: string;
    description?: string;
    labelFor?: string;
    control: Node | null;
    wrapperClass?: string;
    required?: boolean;
  }

  let {
    label,
    description = "",
    labelFor,
    control,
    wrapperClass = "",
    required = false,
  }: Props = $props();
</script>

<div class={`wa-form-row mqb-form-row ${wrapperClass}`.trim()}>
  <label class="wa-form-label mqb-form-label" for={labelFor}>
    <span>{label}</span>
    {#if required}
      <span class="mqb-form-required">*</span>
    {/if}
  </label>
  <div class="wa-form-col mqb-form-col">
    <MountedNode node={control} />
    {#if description}
      <div class="form-description mqb-form-description">{description}</div>
    {/if}
  </div>
</div>
