import { mount } from "svelte";
import App from "./App.svelte";
import { bootstrapApp } from "./bootstrap";
import { appWindow, mqbDialogs } from "./lib/runtime-window";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app mount target");
}

mount(App, { target });

bootstrapApp().catch(async (error) => {
  console.error(error);
  await mqbDialogs.alert(`Failed to start UI: ${(error as Error).message}`);
});
