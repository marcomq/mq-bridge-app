<script lang="ts">
  import MountedNode from "./MountedNode.svelte";

  interface Props {
    inputId?: string;
    value: string;
    placeholder?: string;
    valueContent: Node | null;
    removeClassName: string;
  }

  let {
    inputId,
    value,
    placeholder = "Key",
    valueContent,
    removeClassName,
  }: Props = $props();
</script>

<div class="response-header-row mqb-header-row mqb-additional-property-row">
  <input
    id={inputId}
    type="text"
    class="field-input ap-key js-ap-key mqb-additional-property-key"
    placeholder={placeholder}
    value={value}
    data-original-key={value}
  />

  <div class="mqb-additional-property-value">
    <MountedNode node={valueContent} />
  </div>

  <button type="button" class={removeClassName}>Delete</button>
</div>
