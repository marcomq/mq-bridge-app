import { mount } from "svelte";
import App from "./App.svelte";
import { bootstrapApp } from "./bootstrap";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app mount target");
}

mount(App, { target });

bootstrapApp().catch(async (error) => {
  console.error(error);
  if (window.mqbAlert) {
    await window.mqbAlert(`Failed to start UI: ${(error as Error).message}`);
  }
});
