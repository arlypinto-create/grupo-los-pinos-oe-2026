(function () {
  "use strict";

  const normalize = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const valueOf = (cell) => {
    if (!cell) return null;
    return cell.v ?? cell.f ?? null;
  };

  const numberOf = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value ?? "").replace(/\s/g, "").replace("%", "");
    if (!text) return null;
    let normalized = text;
    if (text.includes(",") && text.includes(".")) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else if (text.includes(",")) {
      normalized = text.replace(",", ".");
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const meaningful = (value) => {
    const text = String(value ?? "").trim();
    return text && !/^no informado/i.test(text) && !/^a definir$/i.test(text);
  };

  const tableRows = (table) => {
    const labels = table.cols.map((column, index) =>
      normalize(column.label || column.id || `col_${index}`),
    );
    return table.rows.map((row) =>
      Object.fromEntries(
        labels.map((label, index) => [label, valueOf(row.c[index])]),
      ),
    );
  };

  const loadSheet = (spreadsheetId, sheetName, headers = 1) =>
    new Promise((resolve, reject) => {
      const callbackName = `__glpSheet_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheet timeout"));
      }, 12000);

      window[callbackName] = (response) => {
        window.clearTimeout(timer);
        cleanup();
        if (response?.status === "error" || !response?.table) {
          reject(new Error("Google Sheet unavailable"));
          return;
        }
        resolve(tableRows(response.table));
      };

      script.onerror = () => {
        window.clearTimeout(timer);
        cleanup();
        reject(new Error("Google Sheet unavailable"));
      };
      script.src =
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
          spreadsheetId,
        )}/gviz/tq?headers=${headers}&sheet=${encodeURIComponent(
          sheetName,
        )}&tqx=out:json;responseHandler:${callbackName}&_=${Date.now()}`;
      document.head.appendChild(script);
    });

  const updateObjectives = (data, rows) => {
    const byCode = new Map(
      data.objectives.map((objective) => [
        normalize(objective.codigo).replace(/\s/g, ""),
        objective,
      ]),
    );

    rows.forEach((row) => {
      const sourceCode =
        row.oe ||
        Object.values(row).find((value) => /^OE\s*\d+$/i.test(String(value).trim()));
      const code = normalize(sourceCode).replace(/\s/g, "");
      const objective = byCode.get(code);
      if (!objective) return;

      const assignText = (field, column) => {
        if (meaningful(row[column])) objective[field] = String(row[column]).trim();
      };
      const assignNumber = (field, column) => {
        const value = numberOf(row[column]);
        if (value !== null) objective[field] = value;
      };

      assignText("nombre", "nombre ejecutivo");
      assignText("definicion", "definicion");
      assignText("finalidad", "finalidad");
      assignText("metodo_medicion", "metodo de calculo");
      assignText("unidad", "unidad de medida");
      assignText("frecuencia", "medicion");
      assignText("explicacion", "explicacion del indicador");
      assignText("responsable", "responsable");
      assignNumber("meta_1s", "meta 1° semestre");
      assignNumber("resultado_1s", "resultado 1° semestre");
      assignNumber("cumplimiento_1s", "% cumplimiento semestre");
      assignNumber("meta_anual_vigente", "meta anual");
      assignNumber("resultado_anual_acumulado", "resultado anual");
      assignNumber("avance_anual", "% avance anual");
      assignNumber("ponderacion", "ponderacion");
      assignNumber("contribucion_anual", "cumplimiento ponderado anual");

      if (
        Number.isFinite(objective.cumplimiento_1s) &&
        Number.isFinite(objective.ponderacion)
      ) {
        objective.contribucion_1s =
          objective.cumplimiento_1s * objective.ponderacion;
      }

      if (meaningful(row["plan de accion"])) {
        objective.plan_accion = String(row["plan de accion"])
          .split(/\n|;|\u2022/)
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (/cumplido/i.test(String(row["estado semestre"] ?? ""))) {
        objective.estado_1s = "Cumplido";
      }
    });

    data.summary.weighted1S = data.objectives.reduce(
      (sum, objective) =>
        sum +
        (Number.isFinite(objective.contribucion_1s)
          ? objective.contribucion_1s
          : 0),
      0,
    );
    data.summary.weightedAnnual = data.objectives.reduce(
      (sum, objective) =>
        sum +
        (Number.isFinite(objective.contribucion_anual)
          ? objective.contribucion_anual
          : 0),
      0,
    );
    data.summary.totalWeight = data.objectives.reduce(
      (sum, objective) =>
        sum + (Number.isFinite(objective.ponderacion) ? objective.ponderacion : 0),
      0,
    );
  };

  const updateBusiness = (data, rows) => {
    const aliases = {
      "facturacion anual": "Facturación Mensual",
      "facturacion mensual": "Facturación Mensual",
      "valor del modulo (andis)": "Valor del Módulo (ANDIS)",
      "gasto operativo anual": "Gasto Operativo Anual",
      inversiones: "Inversiones",
      "fondo de cobertura": "Fondo de Cobertura",
      "retiros societarios": "Retiros Societarios",
      saldo: "Saldo",
    };
    const monthColumns = ["ene-26", "feb-26", "mar-26", "abr-26", "may-26", "jun-26"];

    rows.forEach((source) => {
      const sourceName =
        source.item ||
        Object.values(source).find((value) => aliases[normalize(value)]);
      const targetName = aliases[normalize(sourceName)];
      const target = data.businessEvolution.rows.find(
        (row) => row.indicator === targetName,
      );
      if (!target) return;

      const plan = numberOf(source.plan);
      const accum = numberOf(source.acum);
      const values = monthColumns.map((column) => numberOf(source[column]) ?? 0);
      if (plan !== null) target.plan = plan;
      if (accum !== null) target.reportedAccum = accum;
      target.values = values;
      target.monthly = values.map((value, index) => ({
        month: data.businessEvolution.months[index].key,
        label: data.businessEvolution.months[index].label,
        value,
      }));
      target.calculatedAccum =
        targetName === "Valor del Módulo (ANDIS)"
          ? null
          : values.reduce((sum, value) => sum + value, 0);
      target.planProgress =
        Number.isFinite(target.plan) && target.plan !== 0 && Number.isFinite(accum)
          ? accum / target.plan
          : null;
    });
  };

  window.GLPSheetSync = async (fallbackData, config) => {
    const data = structuredClone(fallbackData);
    const spreadsheetId = config.spreadsheetId;
    const [objectiveRows, businessRows] = await Promise.all([
      loadSheet(
        spreadsheetId,
        config.objectivesSheet || "Matriz Ejecutiva",
        config.objectivesHeaders || 3,
      ),
      loadSheet(
        spreadsheetId,
        config.businessSheet || "KPI GLP",
        config.businessHeaders || 1,
      ),
    ]);
    updateObjectives(data, objectiveRows);
    updateBusiness(data, businessRows);
    data.metadata.liveSource = "Google Sheets";
    data.metadata.loadedAt = new Date().toISOString();
    return data;
  };
})();

