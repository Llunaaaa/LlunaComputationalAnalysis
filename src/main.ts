import "./styles.css";

const sections = [
  "Home",
  "Arithmetic",
  "Functions",
  "Table",
  "Graph",
  "Algebra",
  "Systems",
  "Trigonometry",
  "Matrices",
  "Calculus",
  "Statistics",
  "Probability",
  "Geometry",
  "Financial",
] as const;

type Section = (typeof sections)[number];

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Application root was not found");
}

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Application sections">
      <div class="sidebar-heading">
        <p class="eyebrow">LLUNA</p>
        <h1>Computational Analysis</h1>
      </div>
      <nav class="section-list">
        ${sections
          .map(
            (section) => `
              <button class="section-button" type="button" data-section="${section}">
                ${section}
              </button>
            `,
          )
          .join("")}
      </nav>
    </aside>
    <section class="page-area">
      <header class="page-header">
        <span class="page-kicker">Windows 11 preview</span>
      </header>
      <div id="page-content" class="page-content" aria-live="polite"></div>
    </section>
  </main>
`;

const pageContent = document.querySelector<HTMLDivElement>("#page-content");
const sectionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".section-button"),
);

if (!pageContent || sectionButtons.length !== sections.length) {
  throw new Error("Application navigation was not initialized");
}

const page = pageContent;

function renderPage(section: Section) {
  page.innerHTML = `
    <div class="empty-page">
      <p class="eyebrow">${section}</p>
      <h2>This is where I'll add ${section} content soon.</h2>
    </div>
  `;

  for (const button of sectionButtons) {
    const isActive = button.dataset.section === section;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  }
}

for (const button of sectionButtons) {
  button.addEventListener("click", () => {
    const section = button.dataset.section;
    if (section && sections.includes(section as Section)) {
      renderPage(section as Section);
    }
  });
}

renderPage("Home");
