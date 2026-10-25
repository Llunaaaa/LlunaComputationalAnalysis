import { invoke } from "@tauri-apps/api/core";
import "./styles.css";
import { formatAsciiMath } from "./asciiMath";

const sections = [
  "Home", "Arithmetic", "Functions", "Table", "Graph", "Algebra", "Systems",
  "Trigonometry", "Matrices", "Calculus", "Statistics", "Probability",
  "Geometry", "Financial",
] as const;
type Section = (typeof sections)[number];
type Evaluation = { value: number | null; exact: string | null; error: string | null };
type ExpressionRow = { id: number; expression: string; evaluation: Evaluation | null; evaluating: boolean };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root was not found");

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Application sections">
      <div class="sidebar-heading"><p class="eyebrow logo-mark">LLUNA</p><h1>Computational Analysis</h1></div>
      <nav class="section-list">${sections.map((section) => `
        <button class="section-button" type="button" data-section="${section}">${section}</button>`).join("")}</nav>
    </aside>
    <section class="page-area"><header class="page-header"><span class="page-kicker">Windows 11 preview</span></header>
      <div id="page-content" class="page-content" aria-live="polite"></div>
    </section>
  </main>`;

const pageElement = document.querySelector<HTMLDivElement>("#page-content");
const sectionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".section-button"));
if (!pageElement || sectionButtons.length !== sections.length) throw new Error("Application navigation was not initialized");
const page = pageElement;

let nextRowId = 2;
let rows: ExpressionRow[] = [{ id: 1, expression: "", evaluation: null, evaluating: false }];

function renderPage(section: Section) {
  if (section === "Arithmetic") renderArithmetic();
  else page.innerHTML = `<div class="empty-page"><p class="eyebrow">${section}</p><h2>This is where I'll add ${section} content soon.</h2></div>`;
  for (const button of sectionButtons) {
    const active = button.dataset.section === section;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  }
}

function renderArithmetic(focusId?: number, caretPosition?: number) {
  page.innerHTML = `
    <div class="arithmetic-page">
      <div class="expression-list">${rows.map(renderRow).join("")}</div>
      <button class="add-expression" type="button" id="add-expression"><span>+</span> Add expression</button>
      <p class="syntax-note">Try <code>sqrt(2)</code>, <code>log(100)</code>, <code>pi</code>, <code>e</code>, or <code>5!</code></p>
    </div>`;
  page.querySelector<HTMLButtonElement>("#add-expression")?.addEventListener("click", addRow);
  for (const input of page.querySelectorAll<HTMLTextAreaElement>("[data-row-id]")) {
    input.addEventListener("input", () => updateExpression(input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        evaluateRow(Number(input.dataset.rowId));
      }
    });
  }
  for (const button of page.querySelectorAll<HTMLButtonElement>("[data-remove-row]")) {
    button.addEventListener("click", () => {
      rows = rows.filter((row) => row.id !== Number(button.dataset.removeRow));
      ensureTrailingBlank();
      renderArithmetic();
    });
  }
  for (const button of page.querySelectorAll<HTMLButtonElement>("[data-evaluate-row]")) {
    button.addEventListener("click", () => evaluateRow(Number(button.dataset.evaluateRow)));
  }
  if (focusId !== undefined) {
    requestAnimationFrame(() => focusEditor(focusId, caretPosition));
  }
}

function renderRow(row: ExpressionRow): string {
  const evaluation = row.evaluation;
  const result = row.evaluating ? "Evaluating…" : evaluation?.error
    ? `Error: ${evaluation.error}`
    : evaluation ? `${evaluation.exact ?? formatValue(evaluation.value as number)}${evaluation.exact && !isPlainNumber(evaluation.exact) ? `  ≈  ${formatValue(evaluation.value as number)}` : ""}` : "";
  return `<article class="expression-row">
    <div class="expression-line">
      <span class="line-number">${rows.indexOf(row) + 1}</span>
      <div class="expression-editor">
        <div class="math-display" aria-hidden="true">${formatAsciiMath(row.expression) || '<span class="editor-placeholder">Type an expression</span>'}</div>
        <textarea data-row-id="${row.id}" rows="1" spellcheck="false" aria-label="Expression ${row.id}">${escapeHtml(row.expression)}</textarea>
      </div>
      ${rows.length > 1 ? `<button class="row-action remove-row" type="button" data-remove-row="${row.id}" aria-label="Remove expression">×</button>` : ""}
    </div>
    <div class="expression-result ${evaluation?.error ? "has-error" : ""}" data-result-row="${row.id}">${result}</div>
  </article>`;
}

function updateExpression(input: HTMLTextAreaElement) {
  const row = rows.find((item) => item.id === Number(input.dataset.rowId));
  if (!row) return;
  row.expression = input.value;
  row.evaluation = null;
  const editor = input.closest(".expression-editor");
  if (editor) editor.querySelector<HTMLElement>(".math-display")!.innerHTML =
    formatAsciiMath(row.expression) || '<span class="editor-placeholder">Type an expression</span>';
  page.querySelector<HTMLElement>(`[data-result-row="${row.id}"]`)!.textContent = "";
  if (row.id === rows[rows.length - 1].id && row.expression.trim()) {
    const caretPosition = input.selectionStart;
    rows.push({ id: nextRowId++, expression: "", evaluation: null, evaluating: false });
    renderArithmetic(row.id, caretPosition);
  }
}

function addRow() {
  const newRowId = nextRowId++;
  rows.push({ id: newRowId, expression: "", evaluation: null, evaluating: false });
  renderArithmetic(newRowId, 0);
  page.querySelector<HTMLTextAreaElement>(`textarea[data-row-id="${newRowId}"]`)?.focus();
}

function ensureTrailingBlank() {
  if (!rows.length || rows[rows.length - 1].expression.trim()) {
    rows.push({ id: nextRowId++, expression: "", evaluation: null, evaluating: false });
  }
}

function focusEditor(id: number, caretPosition = 0) {
  const input = page.querySelector<HTMLTextAreaElement>(`textarea[data-row-id="${id}"]`);
  if (input) {
    input.focus();
    input.setSelectionRange(caretPosition, caretPosition);
  }
}

async function evaluateRow(id: number) {
  const row = rows.find((item) => item.id === id);
  if (!row) return;
  const input = page.querySelector<HTMLTextAreaElement>(`textarea[data-row-id="${id}"]`);
  const caretPosition = input?.selectionStart ?? row.expression.length;
  if (!row.expression.trim()) {
    row.evaluation = { value: null, exact: null, error: "Enter an expression" };
    renderArithmetic(id, caretPosition);
    return;
  }
  row.evaluating = true;
  renderArithmetic(id, caretPosition);
  try {
    row.evaluation = await invoke<Evaluation>("evaluate", { expression: row.expression });
  } catch (error) {
    row.evaluation = { value: null, exact: null, error: error instanceof Error ? error.message : "Evaluation failed" };
  } finally {
    row.evaluating = false;
    ensureTrailingBlank();
    renderArithmetic(id, caretPosition);
  }
}

function formatValue(value: number): string { return Number.isInteger(value) ? String(value) : `${value}`; }
function isPlainNumber(value: string): boolean { return /^-?(?:\d+\.?\d*|\.\d+)$/.test(value); }
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

for (const button of sectionButtons) {
  button.addEventListener("click", () => {
    const section = button.dataset.section;
    if (section && sections.includes(section as Section)) renderPage(section as Section);
  });
}
renderPage("Home");
