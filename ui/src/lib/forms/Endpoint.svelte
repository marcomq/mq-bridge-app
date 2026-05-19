<script lang="ts">
  import ScalarEndpointInput from "./ScalarEndpointInput.svelte";
  import { appShell } from "../../lib/app-shell";

  interface Props {
    title?: string;
    description?: string;
    value: string;
    placeholder?: string;
    name?: string;
    onChange: (next: string) => void;
  }

  let {
    title = "Ref Endpoint",
    description = "",
    value,
    placeholder = "Select a publisher id...",
    name,
    onChange,
  }: Props = $props();

  const suggestions = $derived(
    Array.from(
      new Set(
        ((appShell.config<Record<string, any>>()?.publishers || []) as Array<{ id?: string; name?: string }>)
          .map((publisher) => String(publisher?.id || publisher?.name || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
  );
</script>

<ScalarEndpointInput
  {title}
  {description}
  {value}
  {placeholder}
  {suggestions}
  {name}
  {onChange}
/>
