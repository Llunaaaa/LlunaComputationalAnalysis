import './styles.css';
import { getSettings } from './settings/settingsState.ts';

const sections = [
  'Home', 'Arithmetic', 'Functions', 'Table', 'Graph', 'Algebra', 'Systems',
  'Trigonometry', 'Matrices', 'Calculus', 'Statistics', 'Probability', 'Geometry', 'Financial', 'Settings',
] as const;

type Section = (typeof sections)[number];
type Render = (page: HTMLElement) => () => void;

// Sections load on first use, so MathLive and the graph code stay out of
// memory until they are needed.
const loaders: Partial<Record<Section, () => Promise<Render>>> = {
  Arithmetic: () => import('./arithmetic.ts').then((module) => module.renderArithmetic),
  Graph: () => import('./graph.ts').then((module) => module.renderGraph),
  Settings: () => import('./settings/settingsPage.ts').then((module) => module.renderSettings),
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root was not found');
document.documentElement.style.setProperty('--accent', getSettings().ui.accentColor);

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Application sections">
      <nav class="section-list">
        ${sections.map((section) => `<button class="section-button" type="button" data-section="${section}">${section}</button>`).join('')}
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

const page = document.querySelector<HTMLDivElement>('#page-content')!;
const sectionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.section-button'));

let cleanup: (() => void) | null = null;
let navigation = 0;

async function renderPage(section: Section): Promise<void> {
  const ticket = ++navigation;
  for (const button of sectionButtons) {
    const active = button.dataset.section === section;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
  cleanup?.();
  cleanup = null;

  const load = loaders[section];
  if (!load) {
    page.innerHTML = `
      <div class="empty-page">
        <p class="eyebrow">${section}</p>
        <h2>This is where I'll add ${section} content soon.</h2>
      </div>`;
    return;
  }
  try {
    const render = await load();
    if (ticket === navigation) cleanup = render(page);
  } catch (caught) {
    if (ticket !== navigation) return;
    page.textContent = `Failed to load ${section}: ${caught instanceof Error ? caught.message : String(caught)}`;
  }
}

for (const button of sectionButtons) {
  button.addEventListener('click', () => {
    const section = button.dataset.section as Section;
    if (sections.includes(section)) void renderPage(section);
  });
}

void renderPage('Home');
