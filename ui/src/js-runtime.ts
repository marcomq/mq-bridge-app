import "../../static/tauri-bridge.js";
import "./lib/forms/custom-form";
import "@awesome.me/webawesome/dist/webawesome.js";
import "@awesome.me/webawesome/dist/styles/webawesome.css";
import Split from "split.js";
import * as VanillaSchemaForms from "vanilla-schema-forms";
import { Buffer } from "buffer";

globalThis.Buffer = Buffer;

// Simple dialog implementations for browser mode
if (typeof window.mqbAlert === 'undefined') {
  window.mqbAlert = async (message: string, title?: string) => {
    if (title) {
      alert(`${title}\n\n${message}`);
    } else {
      alert(message);
    }
  };

  window.mqbConfirm = async (message: string, title?: string) => {
    return confirm(title ? `${title}\n\n${message}` : message);
  };

  window.mqbPrompt = async (message: string, title?: string, options?: any) => {
    const placeholder = options?.placeholder || '';
    const value = options?.value || '';
    return prompt(title ? `${title}\n\n${message}` : message, value || placeholder);
  };

  window.mqbChoose = async (message: string, title?: string, options?: any) => {
    const choices = options?.choices || [];
    if (choices.length === 0) return null;
    
    const choiceText = choices.map((c: any, i: number) => `${i + 1}. ${c.label}${c.description ? ` - ${c.description}` : ''}`).join('\n');
    const promptText = title ? `${title}\n\n${message}\n\n${choiceText}\n\nEnter number (1-${choices.length}):` : `${message}\n\n${choiceText}\n\nEnter number (1-${choices.length}):`;
    
    const result = prompt(promptText);
    if (!result) return null;
    
    const index = parseInt(result) - 1;
    if (index >= 0 && index < choices.length) {
      return choices[index].value;
    }
    return null;
  };
}
