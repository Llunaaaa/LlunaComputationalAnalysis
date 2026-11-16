import { createMathfield, type MathfieldElement } from '../general/mathfield.ts';
import { equationVariables, rearrangeEquation, simplifyExpression } from './engine.ts';

type AlgebraTab = 'simplify' | 'rearrange';

const REARRANGE_EXAMPLE = '\\frac{1}{f}=(n-1)\\left(\\frac{1}{R_1}-\\frac{1}{R_2}+\\frac{(n-1)d}{nR_1R_2}\\right)';

function displayFractions(latex: string): string {
  return latex.replace(/\\(?:cfrac|frac|tfrac)\b/g, '\\dfrac');
}

function createAlgebraField(className: string, label: string, latex = ''): MathfieldElement {
  const field = createMathfield(className, label);
  field.minFontScale = 0.9;
  field.addEventListener('mount', () => {
    field.keybindings = [
      ...field.keybindings.filter((binding) => !(binding.key === '/' && binding.ifMode === 'math')),
      { key: '/', ifMode: 'math', command: ['insert', '\\dfrac{#@}{#?}'] },
    ];
  }, { once: true });
  field.value = displayFractions(latex);
  return field;
}

export function renderAlgebra(container: HTMLElement): () => void {
  let activeTab: AlgebraTab = 'simplify';
  let field: MathfieldElement | null = null;
  let outputField: MathfieldElement | null = null;
  container.innerHTML = `
    <section class="algebra-page" aria-labelledby="algebra-title">
      <div class="algebra-tabs" role="tablist" aria-label="Algebra operations">
        <button type="button" role="tab" data-algebra-tab="simplify">Simplify</button>
        <button type="button" role="tab" data-algebra-tab="rearrange">Rearrange</button>
      </div>
      <div class="algebra-content" role="tabpanel"></div>
    </section>`;
  const content = container.querySelector<HTMLDivElement>('.algebra-content')!;
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-algebra-tab]'));

  const renderActive = (): void => {
    field?.remove();
    field = null;
    outputField?.remove();
    outputField = null;
    content.innerHTML = activeTab === 'simplify'
      ? `<div class="algebra-workspace">
          <div class="algebra-intro"><p class="eyebrow">Simplify</p><h2 id="algebra-title">Simplify an expression</h2><p>Rewrite an expression into a cleaner equivalent form.</p></div>
          <div class="algebra-card"><label class="algebra-field-label">Expression</label><div class="algebra-field-host"></div><button type="button" class="algebra-action" data-algebra-run>Simplify expression</button><div class="algebra-result"><span>Result</span><strong data-algebra-result>Enter an expression and run Simplify.</strong><small>Example: 2(x + 2) → 2x + 4</small></div></div>
        </div>`
      : `<div class="algebra-workspace">
          <div class="algebra-intro"><p class="eyebrow">Rearrange</p><h2 id="algebra-title">Rearrange an equation</h2><p>Choose a variable and solve the equation for that variable.</p></div>
          <div class="algebra-card"><div class="algebra-box"><label class="algebra-field-label">Base equation</label><div class="algebra-field-host"></div></div><label class="algebra-field-label algebra-target-label">Solve for <select data-algebra-target></select></label><button type="button" class="algebra-action" data-algebra-run>Rearrange equation</button><div class="algebra-box algebra-result-box"><label class="algebra-field-label">Rearranged equation</label><div class="algebra-result-host"></div><small data-algebra-feedback>Choose a variable and run Rearrange.</small></div></div>
        </div>`;
    const host = content.querySelector<HTMLDivElement>('.algebra-field-host')!;
    field = createAlgebraField('algebra-expression-field', activeTab === 'simplify' ? 'Expression to simplify' : 'Equation to rearrange', activeTab === 'simplify' ? '2(x+2)' : REARRANGE_EXAMPLE);
    field.setAttribute('placeholder', activeTab === 'simplify' ? '2(x + 2)' : 'Enter an equation');
    host.appendChild(field);
    const target = activeTab === 'rearrange'
      ? content.querySelector<HTMLSelectElement>('[data-algebra-target]')
      : null;
    if (activeTab === 'rearrange') {
      if (!target) throw new Error('Rearrangement target control is missing');
      const updateVariables = (): void => {
        const detected = equationVariables(field!.value);
        const selected = target.value || detected[0] || '';
        target.replaceChildren(...detected.map((variable) => {
          const option = document.createElement('option');
          option.value = variable;
          option.textContent = variable;
          return option;
        }));
        target.value = detected.includes(selected) ? selected : detected[0] || '';
      };
      field.addEventListener('input', updateVariables);
      field.addEventListener('mount', updateVariables, { once: true });
      updateVariables();
      queueMicrotask(updateVariables);
      const outputHost = content.querySelector<HTMLDivElement>('.algebra-result-host')!;
      outputField = createAlgebraField('algebra-expression-field algebra-result-field', 'Rearranged equation');
      outputField.setAttribute('readonly', '');
      outputHost.appendChild(outputField);
    }
    const action = content.querySelector<HTMLButtonElement>('[data-algebra-run]')!;
    const result = content.querySelector<HTMLElement>('[data-algebra-result]')!;
    const feedback = content.querySelector<HTMLElement>('[data-algebra-feedback]');
    action.addEventListener('click', () => {
      try {
        if (activeTab === 'simplify') {
          result.textContent = simplifyExpression(field!.value);
          result.classList.remove('has-error');
        } else {
          outputField!.value = displayFractions(rearrangeEquation(field!.value, target!.value));
          if (feedback) feedback.textContent = '';
        }
      } catch (caught) {
        if (activeTab === 'simplify') {
          result.textContent = caught instanceof Error ? caught.message : String(caught);
          result.classList.add('has-error');
        } else {
          outputField!.value = '';
          if (feedback) feedback.textContent = caught instanceof Error ? caught.message : String(caught);
        }
      }
    });
    for (const tab of tabs) {
      const selected = tab.dataset.algebraTab === activeTab;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  };
  const onTabClick = (event: Event): void => {
    const tab = (event.currentTarget as HTMLButtonElement).dataset.algebraTab as AlgebraTab;
    activeTab = tab;
    renderActive();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (!tabs.includes(document.activeElement as HTMLButtonElement)) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.dataset.algebraTab === activeTab);
    activeTab = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].dataset.algebraTab as AlgebraTab;
    renderActive();
    tabs.find((tab) => tab.dataset.algebraTab === activeTab)?.focus();
  };
  for (const tab of tabs) tab.addEventListener('click', onTabClick);
  container.addEventListener('keydown', onKeyDown);
  renderActive();
  return () => {
    field?.remove();
    for (const tab of tabs) tab.removeEventListener('click', onTabClick);
    container.removeEventListener('keydown', onKeyDown);
  };
}
