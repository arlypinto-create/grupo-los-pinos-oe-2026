(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    data: null,
    period: "annual",
    search: "",
    filter: "all",
    activeObjective: null,
    lastFocus: null,
    visibleBusinessSeries: new Set([
      "FacturaciÃ³n Mensual",
      "Gasto Operativo Anual",
      "Inversiones",
      "Retiros Societarios",
      "Saldo",
    ]),
  };

  const locale = "es-AR";
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const decimalFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
  const percentFormatter = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });

  const businessSeries = {
    "FacturaciÃ³n Mensual": { color: "#58a947", type: "bar" },
    "Gasto Operativo Anual": { color: "#7763a6", type: "bar" },
    Inversiones: { color: "#e38b2c", type: "line" },
    "Retiros Societarios": { color: "#c96262", type: "line" },
    Saldo: { color: "#0867bd", type: "line" },
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const publicText = (value, fallback = "A definir") => {
    const cleaned = String(value ?? "")
      .replaceAll("Pendiente de validaciÃ³n", "A confirmar por DirecciÃ³n")
      .replaceAll("pendiente de validaciÃ³n", "a confirmar por DirecciÃ³n")
      .replace(/\?+/g, "")
      .replace(/^\s*[â€¢.]\s*/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return cleaned || fallback;
  };

  const formatPercent = (value) =>
    Number.isFinite(value) ? percentFormatter.format(value) : "S/D";

  const isPercentageUnit = (unit) =>
    /porcentaje|%|Ã­ndice|implementaciÃ³n|avance del plan/i.test(unit ?? "");

  const formatMetric = (value, unit) => {
    if (!Number.isFinite(value)) return "A definir";
    if (isPercentageUnit(unit)) return formatPercent(value);
    return Number.isInteger(value)
      ? numberFormatter.format(value)
      : decimalFormatter.format(value);
  };

  const shortUnit = (unit) => {
    const text = String(unit ?? "").toLowerCase();
    if (text.includes("mes")) return "meses";
    if (text.includes("mÃ³dulo")) return "mÃ³dulos";
    if (text.includes("proceso")) return "procesos";
    if (text.includes("cantidad")) return "unidades";
    return unit || "unidades";
  };

  const formatDifferenceValue = (objective) => {
    const target = objective.meta_1s;
    const result = objective.resultado_1s;
    if (!Number.isFinite(target) || !Number.isFinite(result)) return "S/D";
    const difference = Math.abs(result - target);
    if (isPercentageUnit(objective.unidad)) {
      return `${decimalFormatter.format(difference * 100)} pp`;
    }
    return `${formatMetric(difference, objective.unidad)} ${shortUnit(objective.unidad)}`;
  };

  const differenceNarrative = (objective) => {
    const target = objective.meta_1s;
    const result = objective.resultado_1s;
    if (!Number.isFinite(target) || !Number.isFinite(result)) {
      return "No existen datos suficientes para calcular el cumplimiento.";
    }
    const difference = result - target;
    if (Math.abs(difference) < 1e-9) {
      return "La meta fue alcanzada en su totalidad.";
    }
    if (isPercentageUnit(objective.unidad)) {
      const points = decimalFormatter.format(Math.abs(difference) * 100);
      return difference > 0
        ? `El resultado superÃ³ la meta en ${points} puntos porcentuales.`
        : `El resultado se ubicÃ³ ${points} puntos porcentuales por debajo de la meta.`;
    }
    const value = formatMetric(Math.abs(difference), objective.unidad);
    const unit = shortUnit(objective.unidad);
    return difference > 0
      ? `El resultado superÃ³ la meta en ${value} ${unit}.`
      : `El resultado se ubicÃ³ ${value} ${unit} por debajo de la meta.`;
  };

  const metricForPeriod = (objective, period = state.period) => {
    if (period === "annual") return objective.avance_anual;
    return objective.cumplimiento_1s;
  };

  const stateForPeriod = (objective, period = state.period) => {
    if (period === "annual") return objective.estado_anual || "En proceso";
    return objective.estado_1s || "Sin datos";
  };

  const stateClass = (label) => {
    if (label === "Cumplido") return "is-achieved";
    if (label === "En seguimiento") return "is-follow";
    if (label === "Sin datos") return "is-missing";
    return "is-process";
  };

  const weightedForPeriod = () =>
    state.period === "annual"
      ? state.data.summary.weightedAnnual
      : state.data.summary.weighted1S;

  const filteredObjectives = () => {
    const needle = state.search.trim().toLocaleLowerCase(locale);
    return state.data.objectives.filter((objective) => {
      const haystack = [
        objective.codigo,
        objective.nombre,
        objective.definicion,
        objective.finalidad,
      ]
        .join(" ")
        .toLocaleLowerCase(locale);
      const stateLabel = stateForPeriod(objective);
      return (
        (!needle || haystack.includes(needle)) &&
        (state.filter === "all" || stateLabel === state.filter)
      );
    });
  };

  const renderPrimaryKpi = () => {
    $("weightedValue").textContent = formatPercent(weightedForPeriod());
    $("weightedPeriod").textContent =
      state.period === "annual"
        ? "Avance anual actual"
        : state.period === "compare"
          ? "Corte del primer semestre"
          : "Primer semestre";
  };

  const renderObjectiveChart = () => {
    const objectives = filteredObjectives();
    $("objectiveChart").innerHTML = objectives
      .map((objective) => {
        const semester = objective.cumplimiento_1s;
        const annual = objective.avance_anual;
        if (state.period === "compare") {
          const semesterWidth = Number.isFinite(semester)
            ? Math.min(semester * 100, 100)
            : 0;
          const annualWidth = Number.isFinite(annual)
            ? Math.min(annual * 100, 100)
            : 0;
          return `
            <div class="objective-row">
              <span class="objective-row-code">${escapeHtml(objective.codigo.replace(" ", ""))}</span>
              <div class="comparison-track" aria-label="${escapeHtml(objective.codigo)}: semestre ${formatPercent(semester)}, anual ${formatPercent(annual)}">
                <div class="bar-track"><span class="bar-fill" style="width:${semesterWidth}%"></span></div>
                <div class="bar-track"><span class="bar-fill" style="width:${annualWidth}%"></span></div>
              </div>
              <span class="objective-row-value">${formatPercent(semester)} / ${formatPercent(annual)}</span>
            </div>`;
        }
        const value = metricForPeriod(objective);
        const width = Number.isFinite(value) ? Math.min(value * 100, 100) : 0;
        return `
          <div class="objective-row">
            <span class="objective-row-code">${escapeHtml(objective.codigo.replace(" ", ""))}</span>
            <div class="bar-track" aria-label="${escapeHtml(objective.codigo)}: ${formatPercent(value)}">
              <span class="bar-fill ${stateClass(stateForPeriod(objective))}" style="width:${width}%"></span>
            </div>
            <span class="objective-row-value">${formatPercent(value)}</span>
          </div>`;
      })
      .join("");
  };

  const renderObjectiveCards = () => {
    const objectives = filteredObjectives();
    $("resultCount").textContent = `${objectives.length} de ${state.data.objectives.length} objetivos`;
    $("emptyState").hidden = objectives.length > 0;
    $("objectiveCards").innerHTML = objectives
      .map((objective) => {
        const value = metricForPeriod(objective);
        const width = Number.isFinite(value) ? Math.min(value * 100, 100) : 0;
        const status = stateForPeriod(objective);
        return `
          <article class="objective-card" tabindex="0" data-objective="${objective.numero}" aria-label="Abrir ficha de ${escapeHtml(objective.codigo)}">
            <div class="objective-card-top">
              <span class="objective-card-code">${escapeHtml(objective.codigo)}</span>
              <span class="state-pill ${stateClass(status)}">${escapeHtml(status)}</span>
            </div>
            <h4>${escapeHtml(publicText(objective.nombre))}</h4>
            <p>${escapeHtml(publicText(objective.definicion))}</p>
            <div>
              <div class="card-metric">
                <span>${state.period === "annual" ? "Avance anual" : "Cumplimiento 1S"}</span>
                <strong>${formatPercent(value)}</strong>
              </div>
              <div class="card-progress-track" aria-hidden="true"><span style="width:${width}%"></span></div>
            </div>
            <button type="button" class="open-card-button" data-open-objective="${objective.numero}">Abrir ficha â†’</button>
          </article>`;
      })
      .join("");

    document.querySelectorAll("[data-open-objective]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openObjective(Number(button.dataset.openObjective));
      });
    });
    document.querySelectorAll(".objective-card").forEach((card) => {
      const number = Number(card.dataset.objective);
      card.addEventListener("dblclick", () => openObjective(number));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openObjective(number);
        }
      });
    });
  };

  const resultCard = (label, value) => `
    <div class="result-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;

  const proposalValue = (objective, key) => {
    const value = objective[key];
    return Number.isFinite(value)
      ? `${formatMetric(value, objective.unidad)}${isPercentageUnit(objective.unidad) ? "" : ` ${shortUnit(objective.unidad)}`}`
      : "A confirmar por DirecciÃ³n";
  };

  const reviewMarkup = (objective) => {
    if (objective.numero === 1) {
      return `
        <ul class="review-text">
          <li>Heilen: 6 meses.</li>
          <li>Araucarias: 6 meses.</li>
          <li>Cipreses: 4 meses desde septiembre.</li>
          <li>Propuesta segundo semestre: 16 meses.</li>
          <li>Nueva propuesta anual: 31 meses (1S: 15 meses / 2S: 16 meses)</li>
        </ul>`;
    }
    return `<p class="review-text">${escapeHtml(publicText(objective.revision_2s, "A confirmar por DirecciÃ³n")).replaceAll("\n", "<br>")}</p>`;
  };

  const actionList = (objective) => {
    const actions = objective.plan_accion?.length
      ? objective.plan_accion
      : ["A definir"];
    return actions
      .map(
        (action) => `<li>${escapeHtml(publicText(action))}</li>`,
      )
      .join("");
  };

  const openObjective = (number) => {
    const objective = state.data.objectives.find(
      (item) => item.numero === Number(number),
    );
    if (!objective) return;
    state.activeObjective = objective;
    state.lastFocus = document.activeElement;
    $("detailCode").textContent = `Objetivo EstratÃ©gico ${String(objective.numero).padStart(2, "0")}`;
    $("detailTitle").textContent = `${objective.codigo} | ${publicText(objective.nombre)}`;
    $("detailPurpose").textContent = publicText(objective.finalidad);
    const status = objective.estado_1s || "Sin datos";
    const annualView = state.period === "annual";
    const contributionLabel = annualView
      ? "ContribuciÃ³n ponderada anual"
      : "ContribuciÃ³n ponderada 1S";
    const contributionValue = annualView
      ? objective.contribucion_anual
      : objective.contribucion_1s;
    $("detailContent").innerHTML = `
      <section class="detail-indicator-strip" aria-label="Indicadores del objetivo">
        <div class="indicator-tile is-data">
          <span>Datos del indicador</span>
          <div class="indicator-data-grid">
            <div><b>Unidad:</b> ${escapeHtml(publicText(objective.unidad))}</div>
            <div><b>Frecuencia:</b> ${escapeHtml(publicText(objective.frecuencia, "A definir"))}</div>
            <div><b>Meta 1S:</b> ${escapeHtml(formatMetric(objective.meta_1s, objective.unidad))}</div>
            <div><b>Resultado 1S:</b> ${escapeHtml(formatMetric(objective.resultado_1s, objective.unidad))}</div>
          </div>
        </div>
        <div class="indicator-tile">
          <span>Cumplimiento 1S</span>
          <strong>${formatPercent(objective.cumplimiento_1s)}</strong>
        </div>
        <div class="indicator-tile">
          <span>Avance anual</span>
          <strong>${formatPercent(objective.avance_anual)}</strong>
        </div>
        <div class="indicator-tile">
          <span>PonderaciÃ³n</span>
          <strong>${formatPercent(objective.ponderacion)}</strong>
        </div>
        <div class="indicator-tile">
          <span>${escapeHtml(contributionLabel)}</span>
          <strong>${formatPercent(contributionValue)}</strong>
        </div>
      </section>

      <article class="detail-card full">
        <h3>Objetivo Original</h3>
        <p>${escapeHtml(publicText(objective.definicion))}</p>
      </article>

      <article class="detail-card full">
        <h3>Resultado del Semestre</h3>
        <div class="result-metrics">
          ${resultCard("Meta del primer semestre", Number.isFinite(objective.meta_1s) ? `${formatMetric(objective.meta_1s, objective.unidad)} ${isPercentageUnit(objective.unidad) ? "" : shortUnit(objective.unidad)}`.trim() : "A definir")}
          ${resultCard("Resultado alcanzado", Number.isFinite(objective.resultado_1s) ? `${formatMetric(objective.resultado_1s, objective.unidad)} ${isPercentageUnit(objective.unidad) ? "" : shortUnit(objective.unidad)}`.trim() : "S/D")}
          ${resultCard("Diferencia absoluta", formatDifferenceValue(objective))}
          ${resultCard("Cumplimiento", formatPercent(objective.cumplimiento_1s))}
        </div>
        <p class="result-narrative">${escapeHtml(differenceNarrative(objective))}</p>
        <p class="result-state">Estado descriptivo: <span class="state-pill ${stateClass(status)}">${escapeHtml(status)}</span></p>
        <p class="explanation">${escapeHtml(publicText(objective.explicacion, "A confirmar por DirecciÃ³n"))}</p>
      </article>

      <article class="detail-card full">
        <h3>RevisiÃ³n Segundo Semestre</h3>
        <div class="proposal-grid">
          <div class="proposal-box">
            <span>Nueva propuesta anual</span>
            <strong>${escapeHtml(proposalValue(objective, "meta_anual_revisada"))}</strong>
          </div>
          <div class="proposal-box is-second">
            <span>Propuesta segundo semestre</span>
            <strong>${escapeHtml(proposalValue(objective, "meta_2s_propuesta"))}</strong>
          </div>
        </div>
        ${reviewMarkup(objective)}
        <p class="explanation"><strong>JustificaciÃ³n:</strong> ${escapeHtml(publicText(objective.justificacion, "A confirmar por DirecciÃ³n"))}</p>
      </article>

      <article class="detail-card full">
        <h3>PrÃ³ximos acuerdos de gestiÃ³n</h3>
        <ul class="action-list">${actionList(objective)}</ul>
      </article>`;
    $("detailBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
    $("objectiveDetail").focus();
  };

  const closeObjective = () => {
    $("detailBackdrop").hidden = true;
    document.body.style.overflow = "";
    state.activeObjective = null;
    state.lastFocus?.focus?.();
  };

  const businessRowClass = (indicator) => {
    if (indicator.includes("ANDIS")) return "row-andis";
    if (indicator.includes("FacturaciÃ³n")) return "row-billing";
    if (indicator.includes("Gasto")) return "row-spend";
    if (indicator.includes("Inversiones")) return "row-invest";
    if (indicator.includes("Fondo")) return "row-fund";
    if (indicator.includes("Retiros")) return "row-withdrawal";
    return "row-balance";
  };

  const formatBusinessValue = (value, unit) => {
    if (!Number.isFinite(value)) return "â€”";
    return unit === "ARS"
      ? currencyFormatter.format(value).replace(/\s+/g, " ")
      : decimalFormatter.format(value);
  };

  const renderBusinessTable = () => {
    const { months, rows } = state.data.businessEvolution;
    $("businessTableHead").innerHTML = `
      <tr>
        <th>Item</th>
        <th>Plan</th>
        <th>Acumulado Total</th>
        ${months.map((month) => `<th>${escapeHtml(month.label)}</th>`).join("")}
      </tr>`;
    $("businessTableBody").innerHTML = rows
      .map(
        (row) => `
          <tr class="${businessRowClass(row.indicator)}">
            <td>${escapeHtml(row.indicator)}</td>
            <td>${formatBusinessValue(row.plan, row.unit)}</td>
            <td>${formatBusinessValue(row.calculatedAccum, row.unit)}</td>
            ${row.monthly.map((point) => `<td>${formatBusinessValue(point.value, row.unit)}</td>`).join("")}
          </tr>`,
      )
      .join("");
  };

  const svgElement = (name, attributes = {}) => {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      name,
    );
    Object.entries(attributes).forEach(([key, value]) =>
      element.setAttribute(key, String(value)),
    );
    return element;
  };

  const appendText = (svg, text, x, y, className, anchor = "middle") => {
    const node = svgElement("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    });
    node.textContent = text;
    svg.appendChild(node);
  };

  const bindTooltip = (container) => {
    if (container.dataset.tooltipBound) return;
    container.dataset.tooltipBound = "true";
    container.addEventListener("pointermove", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (!target) {
        $("chartTooltip").hidden = true;
        return;
      }
      $("chartTooltip").textContent = target.dataset.tooltip;
      $("chartTooltip").hidden = false;
      const left = Math.min(event.clientX + 14, window.innerWidth - 270);
      const top = Math.max(event.clientY - 46, 10);
      $("chartTooltip").style.left = `${left}px`;
      $("chartTooltip").style.top = `${top}px`;
    });
    container.addEventListener("pointerleave", () => {
      $("chartTooltip").hidden = true;
    });
  };

  const renderBusinessLegend = () => {
    $("businessLegend").innerHTML = Object.entries(businessSeries)
      .map(
        ([name, config]) => `
          <button
            type="button"
            class="series-toggle"
            data-series="${escapeHtml(name)}"
            aria-pressed="${state.visibleBusinessSeries.has(name)}"
            style="--series-color:${config.color}"
          >
            <span class="legend-dot"></span>${escapeHtml(name)}
          </button>`,
      )
      .join("");
    document.querySelectorAll("[data-series]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.series;
        if (state.visibleBusinessSeries.has(name)) {
          state.visibleBusinessSeries.delete(name);
        } else {
          state.visibleBusinessSeries.add(name);
        }
        renderBusinessLegend();
        renderBusinessChart();
      });
    });
  };

  const renderBusinessChart = () => {
    const container = $("businessChart");
    container.innerHTML = "";
    const width = 860;
    const height = 370;
    const margin = { top: 24, right: 24, bottom: 54, left: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const months = state.data.businessEvolution.months;
    const rows = state.data.businessEvolution.rows.filter(
      (row) =>
        businessSeries[row.indicator] &&
        state.visibleBusinessSeries.has(row.indicator),
    );
    const maxValue = Math.max(
      100,
      ...rows.flatMap((row) => row.values.filter(Number.isFinite)),
    );
    const yMax = Math.ceil(maxValue / 20) * 20;
    const y = (value) =>
      margin.top + plotHeight - (value / yMax) * plotHeight;
    const groupWidth = plotWidth / months.length;
    const xCenter = (index) =>
      margin.left + groupWidth * index + groupWidth / 2;
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "EvoluciÃ³n mensual del negocio expresada en mÃ³dulos",
    });

    for (let tick = 0; tick <= 5; tick += 1) {
      const value = (yMax / 5) * tick;
      const yPos = y(value);
      svg.appendChild(
        svgElement("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: yPos,
          y2: yPos,
          class: "chart-grid-line",
        }),
      );
      appendText(
        svg,
        numberFormatter.format(value),
        margin.left - 10,
        yPos + 4,
        "chart-axis-label",
        "end",
      );
    }

    months.forEach((month, index) =>
      appendText(
        svg,
        month.label,
        xCenter(index),
        height - 18,
        "chart-month-label",
      ),
    );

    const bars = rows.filter(
      (row) => businessSeries[row.indicator].type === "bar",
    );
    const barWidth = Math.min(31, (groupWidth * 0.62) / Math.max(bars.length, 1));
    bars.forEach((row, seriesIndex) => {
      row.values.forEach((value, index) => {
        const x =
          xCenter(index) -
          (bars.length * barWidth) / 2 +
          seriesIndex * barWidth +
          1;
        const yPos = y(value);
        const rect = svgElement("rect", {
          x,
          y: yPos,
          width: Math.max(barWidth - 3, 6),
          height: margin.top + plotHeight - yPos,
          rx: 4,
          fill: businessSeries[row.indicator].color,
          class: "chart-bar",
          "data-tooltip": `${months[index].label} Â· ${row.indicator}: ${decimalFormatter.format(value)} mÃ³dulos`,
        });
        svg.appendChild(rect);
      });
    });

    rows
      .filter((row) => businessSeries[row.indicator].type === "line")
      .forEach((row) => {
        const points = row.values
          .map((value, index) => `${xCenter(index)},${y(value)}`)
          .join(" ");
        svg.appendChild(
          svgElement("polyline", {
            points,
            stroke: businessSeries[row.indicator].color,
            class: "chart-series-line",
          }),
        );
        row.values.forEach((value, index) => {
          svg.appendChild(
            svgElement("circle", {
              cx: xCenter(index),
              cy: y(value),
              r: 5,
              fill: businessSeries[row.indicator].color,
              class: "chart-point",
              "data-tooltip": `${months[index].label} Â· ${row.indicator}: ${decimalFormatter.format(value)} mÃ³dulos`,
            }),
          );
        });
      });

    container.appendChild(svg);
    bindTooltip(container);
  };

  const renderAndisChart = () => {
    const container = $("andisChart");
    container.innerHTML = "";
    const row = state.data.businessEvolution.rows.find((item) =>
      item.indicator.includes("ANDIS"),
    );
    if (!row) return;
    const width = 620;
    const height = 390;
    const margin = { top: 30, right: 22, bottom: 54, left: 90 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const minValue = Math.floor(Math.min(...row.values) / 100000) * 100000;
    const maxValue = Math.ceil(Math.max(...row.values) / 100000) * 100000;
    const y = (value) =>
      margin.top +
      plotHeight -
      ((value - minValue) / (maxValue - minValue)) * plotHeight;
    const x = (index) =>
      margin.left + (plotWidth / (row.values.length - 1)) * index;
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "EvoluciÃ³n del Valor del MÃ³dulo ANDIS",
    });

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = minValue + ((maxValue - minValue) / 4) * tick;
      const yPos = y(value);
      svg.appendChild(
        svgElement("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: yPos,
          y2: yPos,
          class: "chart-grid-line",
        }),
      );
      appendText(
        svg,
        `$ ${numberFormatter.format(value / 1000000)} M`,
        margin.left - 12,
        yPos + 4,
        "chart-axis-label",
        "end",
      );
    }

    const points = row.values
      .map((value, index) => `${x(index)},${y(value)}`)
      .join(" ");
    svg.appendChild(
      svgElement("polyline", {
        points,
        stroke: "#0867bd",
        class: "chart-series-line",
      }),
    );
    row.values.forEach((value, index) => {
      appendText(
        svg,
        state.data.businessEvolution.months[index].label,
        x(index),
        height - 18,
        "chart-month-label",
      );
      svg.appendChild(
        svgElement("circle", {
          cx: x(index),
          cy: y(value),
          r: 6,
          fill: "#06a9df",
          class: "chart-point",
          "data-tooltip": `${state.data.businessEvolution.months[index].label} Â· ${currencyFormatter.format(value)}`,
        }),
      );
    });
    container.appendChild(svg);
    bindTooltip(container);
  };

  const renderAll = () => {
    renderPrimaryKpi();
    renderObjectiveChart();
    renderObjectiveCards();
    renderBusinessTable();
    renderBusinessLegend();
    renderBusinessChart();
    renderAndisChart();
  };

  const bindControls = () => {
    document.querySelectorAll("[data-period]").forEach((button) => {
      button.addEventListener("click", () => {
        state.period = button.dataset.period;
        document.querySelectorAll("[data-period]").forEach((tab) => {
          const active = tab === button;
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-selected", String(active));
        });
        renderPrimaryKpi();
        renderObjectiveChart();
        renderObjectiveCards();
      });
    });
    $("searchInput").addEventListener("input", (event) => {
      state.search = event.target.value;
      renderObjectiveChart();
      renderObjectiveCards();
    });
    $("stateFilter").addEventListener("change", (event) => {
      state.filter = event.target.value;
      renderObjectiveChart();
      renderObjectiveCards();
    });
    $("printButton").addEventListener("click", () => window.print());
    $("closeDetail").addEventListener("click", closeObjective);
    $("detailBackdrop").addEventListener("click", (event) => {
      if (event.target === $("detailBackdrop")) closeObjective();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("detailBackdrop").hidden) {
        closeObjective();
      }
    });
  };

  const loadFromConfig = async () => {
    if (location.protocol === "file:") return window.GLPPublicData;
    try {
      const configResponse = await fetch("assets/data/dashboard-config.json", {
        cache: "no-store",
      });
      const config = configResponse.ok ? await configResponse.json() : null;
      const endpoint = config?.dataSource?.appsScriptEndpoint?.trim();
      const url =
        config?.dataSource?.mode === "apps-script" && endpoint
          ? endpoint
          : config?.dataSource?.localUrl || "data/dashboard-data.json";
      const dataResponse = await fetch(url, { cache: "no-store" });
      if (!dataResponse.ok) throw new Error("unavailable");
      return await dataResponse.json();
    } catch {
      return window.GLPPublicData;
    }
  };

  const initialize = async () => {
    try {
      state.data = await loadFromConfig();
      if (!state.data?.objectives?.length) throw new Error("unavailable");
      bindControls();
      renderAll();
    } catch {
      $("loadFallback").hidden = false;
    }
  };

  initialize();
})();

