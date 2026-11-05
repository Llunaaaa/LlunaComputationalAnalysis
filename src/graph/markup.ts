export const GRAPH_MARKUP = `
  <div class="graph-workspace">
    <aside class="graph-expressions" aria-label="Graph expressions">
      <div class="graph-panel-heading">
        <span>Expressions</span>
        <span class="graph-add-wrap">
          <button class="graph-add" type="button" aria-label="Add expression (right-click for more)" title="Add expression (right-click for more)">+</button>
          <span class="graph-add-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-add-kind="function">Function</button>
            <button type="button" role="menuitem" data-add-kind="slider">Slider</button>
            <button type="button" role="menuitem" disabled title="Coming soon">Table</button>
          </span>
        </span>
      </div>
      <div class="graph-expression-list"></div>
      <div class="graph-color-menu" role="menu" hidden>
        <div class="graph-color-tabs"><button type="button" class="active" aria-selected="true">Color</button></div>
        <div class="graph-color-grid"></div>
        <label class="graph-color-hex">Hex <input type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="#9f9f9f"></label>
      </div>
    </aside>
    <section class="graph-stage">
      <div class="graph-toolbar">
        <button type="button" data-action="fullscreen" aria-label="Toggle fullscreen graph" title="Toggle fullscreen graph">⛶</button>
        <button type="button" data-action="reset" title="Reset view">Reset view</button>
        <button type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
        <label><input type="checkbox" data-option="grid"> Grid</label>
        <label><input type="checkbox" data-option="axes"> Axes</label>
      </div>
      <div class="graph-canvas-wrap">
        <canvas aria-label="Interactive graph plot"></canvas>
        <div class="graph-help">Scroll or pinch to zoom · drag to pan</div>
      </div>
    </section>
  </div>`;
