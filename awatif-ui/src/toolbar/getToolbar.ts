import { State } from "vanjs-core";
import { html, render, TemplateResult } from "lit-html";

import "./styles.css";

export function getToolbar({
  buttons,
  clickedButton,
  author,
  sourceCode,
}: {
  buttons?: string[];
  clickedButton?: State<string>;
  author?: string;
  sourceCode?: string;
}): HTMLElement {
  // Init
  const element = document.createElement("div");

  const template = html`
    <div class="buttons-container">
      ${buttons?.map(
        (button) =>
          html`<button class="btn btn-text" style="padding: 8px 16px;" @click=${onButtonClick}>
            ${button}
          </button>`
      )}
      <button class="btn btn-icon" style="padding: 3px 6px;" @click=${onIconClick}>
        ${getAwatifSvg()}
      </button>
    </div>

    <div id="dropdown-menu" style="display: none;">
      <a
        href="${sourceCode ? sourceCode : "https://github.com/madil4/awatif"}"
        class="dropdown-link"
        >Source Code</a
      >
      ${author
        ? html`<a href="${author}" class="dropdown-link">Message Author</a>`
        : ""}
      <a href="https://develop.feacivil.cloud/myexample/" class="dropdown-link"
        >More Examples</a
      >
    </div>
  `;

  // Update
  element.id = "toolbar";

  render(template, element);

  // Events
  // On button click set clickedButton value
  function onButtonClick(e: Event) {
    const button = e.target as HTMLButtonElement;
    clickedButton.val = ""; // A hack to trigger vanjs update
    setTimeout(() => (clickedButton.val = button.innerText));
  }

  // onIconClick toggle dropdown menu
  function onIconClick(e: Event) {
    const dropdown = document.getElementById("dropdown-menu");
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  }

  return element;
}

// Utils
function getAwatifSvg(): TemplateResult {
  return html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="65"
    height="24"
    viewBox="0 0 65 24"
  >
    <text
      x="50%"
      y="50%"
      dominant-baseline="middle"
      text-anchor="middle"
      font-family="Segoe UI, Roboto, sans-serif"
      font-size="12"
      font-weight="400"
      letter-spacing="0.5"
      fill="white"
    >
      FEAcivil
    </text>
  </svg>`;
}