import { invoke } from "@tauri-apps/api/core";
import "./styles.css";
import { formatAsciiMath } from "./asciiMath";

const sections = [
  "Home", "Arithmetic", "Functions", "Table", "Graph", "Algebra", "Systems",
  "Trigonometry", "Matrices", "Calculus", "Statistics", "Probability",
  "Geometry", "Financial",
] as const;
type Section = (typeof sections)[number];
type Evaluation = { value: number | null; error: string | null };
type ExpressionRow = { id: number; expression: string; evaluation: Evaluation | null; evaluating: boolean };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root was not found");

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Application sections">
      <div class="sidebar-heading"><p class="eyebrow">LLUNA</p><h1>Computational Analysis</h1></div>
      <nav class="section-list">${sections.map((section) => `
        <button class="section-button" type="button" data-section="${section}">${section}</button>`).join("")}</nav>
    </aside>
    <section class="page-area"><header class="page-header"><span class="page-kicker">Windows 11 preview</span></header>
      <div id="page-content" class="page-content" aria-live="polite"></div>
    </section>
  </main>`;

const pageContent = document.querySelector<HTMLDivElement>("#page-content");
const sectionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".section-button"));
if (!pageContent || sectionButtons.length !== sections.length) throw new Error("Application navigation was not initialized");
const page = pageContent;

let nextRowId = 2;
let rows: ExpressionRow[] = [{ id: 1, expression: "3^(2-6)", evaluation: null, evaluating: false }];

function renderPage(section: Section) {
  if (section === "Arithmetic") renderArithmetic();
  else page.innerHTML = `<div class="empty-page"><p class="eyebrow">${section}</p><h2>This is where I'll add ${section} content soon.</h2></div>`;
  for (const button of sectionButtons) {
    const active = button.dataset.section === section;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  }
}

function renderArithmetic() {
  page.innerHTML = `
    <div class="arithmetic-page">
      <p class="eyebrow">Arithmetic</p>
      <h2>Expression workspace</h2>
      <p class="page-description">Enter expressions using familiar ASCII-math notation. Press Enter to evaluate.</p>
      <div class="expression-list">${rows.map(renderRow).join("")}</div>
      <button class="add-expression" type="button" id="add-expression">+ Add expression</button>
    </div>`;
  page.querySelector<HTMLButtonElement>("#add-expression")?.addEventListener("click", () => {
    rows.push({ id: nextRowId++, expression: "", evaluation: null, evaluating: false });
    renderArithmetic();
    page.querySelector<HTMLInputElement>(`input[data-row-id="${rows[rows.length - 1].id}"]`)?.focus();
  });
  for (const input of page.querySelectorAll<HTMLInputElement>("input[data-row-id]")) {
    input.addEventListener("input", () => {
      const row = rows.find((item) => item.id === Number(input.dataset.rowId));
      if (row) { row.expression = input.value; row.evaluation = null; renderRowResult(row); }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); evaluateRow(Number(input.dataset.rowId)); }
    });
  }
  for (const button of page.querySelectorAll<HTMLButtonElement>("[data-remove-row]")) {
    button.addEventListener("click", () => {
      rows = rows.filter((row) => row.id !== Number(button.dataset.removeRow));
      renderArithmetic();
    });
  }
  for (const button of page.querySelectorAll<HTMLButtonElement>("[data-evaluate-row]")) {
    button.addEventListener("click", () => evaluateRow(Number(button.dataset.evaluateRow)));
  }
}

function renderRow(row: ExpressionRow): string {
  const evaluation = row.evaluation;
  const result = row.evaluating ? "Evaluating…" : evaluation?.error ? `Error: ${evaluation.error}` : evaluation ? `= ${formatValue(evaluation.value as number)}` : "Press Enter or Evaluate";
  return `<article class="expression-row">
    <div class="expression-controls"><input data-row-id="${row.id}" value="${escapeAttribute(row.expression)}" placeholder="e.g. sqrt(2)" aria-label="Expression ${row.id}" />
      <button class="evaluate-button" type="button" data-evaluate-row="${row.id}">Evaluate</button>
      ${rows.length > 1 ? `<button class="remove-button" type="button" data-remove-row="${row.id}" aria-label="Remove expression ${row.id}">Remove</button>` : ""}</div>
    <div class="math-preview" aria-label="Mathematical preview">${formatAsciiMath(row.expression) || "Your formatted expression will appear here"}</div>
    <div class="expression-result ${evaluation?.error ? "has-error" : ""}">${result}</div>
  </article>`;
}

function renderRowResult(row: ExpressionRow) {
  const element = page.querySelector<HTMLElement>(`.expression-row:nth-child(${rows.indexOf(row) + 1})`);
  if (!element) return;
  element.querySelector<HTMLElement>(".math-preview")!.innerHTML = formatAsciiMath(row.expression) || "Your formatted expression will appear here";
  element.querySelector<HTMLElement>(".expression-result")!.textContent = "Press Enter or Evaluate";
}

async function evaluateRow(id: number) {
  const row = rows.find((item) => item.id === id);
  if (!row) return;
  if (!row.expression.trim()) { row.evaluation = { value: null, error: "Enter an expression" }; renderArithmetic(); return; }
  row.evaluating = true; renderArithmetic();
  try {
    row.evaluation = await invoke<Evaluation>("evaluate", { expression: row.expression });
  } catch (error) {
    row.evaluation = { value: null, error: error instanceof Error ? error.message : "Evaluation failed" };
  } finally { row.evaluating = false; renderArithmetic(); }
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : `${value}`;
}
function escapeAttribute(value: string): string { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

for (const button of sectionButtons) {
  button.addEventListener("click", () => {
    const section = button.dataset.section;
    if (section && sections.includes(section as Section)) renderPage(section as Section);
  });
}
renderPage("Home");
