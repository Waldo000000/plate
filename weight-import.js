/* Weight import parser. No I/O, DOM access, or dependencies. */
(function (root) {
  "use strict";
  const maxChars = 2000000;
  const maxRows = 30000;
  const KG_PER_LB = 0.45359237;
  const datePart = "(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{1,2} +[A-Za-z]{3,9} +\\d{2,4}|[A-Za-z]{3,9} +\\d{1,2},? +\\d{2,4})";
  const whitespaceRow = new RegExp("^(" + datePart + "(?:[T ]\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?: ?(?:[AP]M|Z|[+-]\\d{2}:?\\d{2}))?)?)\\s+(.+)$", "i");
  const trailingTime = "(?:[T ]\\d{1,2}:\\d{2}(?::\\d{2}(?:[.,]\\d+)?)?(?: ?(?:[AP]M|Z|[+-]\\d{2}:?\\d{2}))?)?";
  const isoDate = new RegExp("^(\\d{4})([-/.])(\\d{1,2})\\2(\\d{1,2})" + trailingTime + "$", "i");
  const shortDate = new RegExp("^(\\d{1,2})([-/.])(\\d{1,2})\\2(\\d{2}|\\d{4})" + trailingTime + "$", "i");
  const dayFirstNamed = new RegExp("^(\\d{1,2})[ -]+([A-Za-z]{3,9})[ -]+(\\d{2}|\\d{4})" + trailingTime + "$", "i");
  const monthFirstNamed = new RegExp("^([A-Za-z]{3,9})[ -]+(\\d{1,2}),?[ -]+(\\d{2}|\\d{4})" + trailingTime + "$", "i");
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const DATE_LABEL = /^(?:date(?: of measurement| recorded| weighed)?|(?:measurement|weigh[- ]?in|recorded|log|entry|start|local) date|day|timestamp|time stamp|(?:recorded|measured|created|logged) at|datetime|date[ /_-]*time|time of measurement)$/i;
  const WEIGHT_LABEL = /(?:\b(?:body[ _-]?)?(?:weight|mass)\b|^(?:value|reading|measurement|kg|kgs|lb|lbs|kilograms?|pounds?)(?:\b|$))/i;
  const CLEAN_WEIGHT_LABEL = /\b(?:body[ _-]?)?(?:weight|mass)\b/i;
  const NON_WEIGHT_LABEL = /(?:\b(?:goal|target|change|difference|delta|trend|average|min|max|previous|ideal|bmi|bmr|fat|muscle|bone|water|loss|gain)\b)/i;
  function isDateLabel(value) {
    const s = String(value ?? "").trim().replace(/\s*\((?:d{1,2}|m{1,2}|y{2,4})[-/.](?:d{1,2}|m{1,2}|y{2,4})[-/.](?:d{1,2}|m{1,2}|y{2,4})\)\s*$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
    return DATE_LABEL.test(s);
  }
  const UNIT_LABEL = /^(?:(?:weight|mass)[ _-]*)?(?:unit[s]?|uom|unit of measure(?:ment)?)$/i;
  
  function unitIn(value) {
    const s = String(value ?? "").toLowerCase();
    const kg = /(?:^|[^a-z])(?:kgs?|kilograms?)(?:[^a-z]|$)/.test(s);
    const lb = /(?:^|[^a-z])(?:lbs?|pounds?)(?:[^a-z]|$)/.test(s);
    return kg === lb ? null : kg ? "kg" : "lb";
  }
  function weightToken(value) {
    let s = String(value ?? "").trim().replace(/[−–]/g, "-").replace(/\u00a0|\u202f/g, " ");
    const match = s.match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(kgs?|kilograms?|lbs?|pounds?)?$/i);
    if (!match) return null;
    return {amount: Number(match[1].replace(",", ".")), unit: unitIn(match[2])};
  }
  function realDay(y, m, d) {
    if (!Number.isInteger(y) || y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date.toISOString().slice(0, 10);
  }
  function yearNumber(s) { return s.length === 2 ? 2000 + Number(s) : Number(s); }
  function namedMonth(s) {
    s = s.toLowerCase();
    if (s === "sept") return 9;
    return months.findIndex(month => month === s || month.slice(0, 3) === s) + 1;
  }
  function dateShape(value) {
    let s = String(value ?? "").trim().replace(/^'+/, "");
    // Some spreadsheets export text dates as ="2026-11-18". Treat only a
    // quoted year-first date literal as text; never evaluate formulas.
    const dateLiteral = s.match(/^=\s*"\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*"$/);
    if (dateLiteral) s = dateLiteral[1];
    let m = s.match(isoDate);
    if (m) return {type: "fixed", day: realDay(+m[1], +m[3], +m[4])};
    m = s.match(dayFirstNamed);
    if (m) return {type: "fixed", day: realDay(yearNumber(m[3]), namedMonth(m[2]), +m[1])};
    m = s.match(monthFirstNamed);
    if (m) return {type: "fixed", day: realDay(yearNumber(m[3]), namedMonth(m[1]), +m[2])};
    m = s.match(shortDate);
    if (m) return {type: "short", dmy: realDay(yearNumber(m[4]), +m[3], +m[1]), mdy: realDay(yearNumber(m[4]), +m[1], +m[3])};
    return null;
  }
  function dateFrom(shape, order) {
    if (!shape) return {reason: "Date not recognized."};
    if (shape.type === "fixed") return shape.day ? {day: shape.day} : {reason: "Invalid calendar date."};
    if (order === "ymd") return {reason: "This date is not year-first."};
    if (!shape.dmy && !shape.mdy) return {reason: "Invalid calendar date."};
    if (order === "dmy" || order === "mdy") return shape[order] ? {day: shape[order]} : {reason: "This date does not match the selected order."};
    if (shape.dmy && shape.mdy && shape.dmy !== shape.mdy) return {reason: "Ambiguous date. Select day/month/year or month/day/year."};
    return {day: shape.dmy || shape.mdy};
  }
  
  function parseDelimited(raw, delimiter) {
    let cells = [], field = "", inside = false, afterQuote = false, line = 1, start = 1, malformed = false;
    const rows = [];
    const pushCell = () => { cells.push(field.trim()); field = ""; afterQuote = false; };
    const pushRow = () => {
      pushCell();
      if (cells.some(Boolean) || malformed) rows.push({line: start, cells, malformed});
      cells = []; malformed = false;
    };
    for (let i = 0; i < raw.length && rows.length < maxRows + 1; i++) {
      const c = raw[i];
      if (c === '"' && inside) {
        if (raw[i + 1] === '"') { field += '"'; i++; } else { inside = false; afterQuote = true; }
      } else if (inside) {
        if (c === "\n") line++;
        field += c;
      } else if (c === "\n") {
        pushRow(); start = ++line;
      } else if (c === delimiter) {
        pushCell();
      } else if (c === '"' && !field.trim() && !afterQuote) {
        field = ""; inside = true;
      } else if (afterQuote && /\S/.test(c)) {
        malformed = true; field += c;
      } else {
        field += c;
      }
    }
    if (inside) malformed = true;
    if (field || cells.length || afterQuote || malformed) pushRow();
    return rows;
  }
  function parseWhitespace(raw) {
    return raw.split("\n").slice(0, maxRows + 1).map((value, index) => {
      const s = value.trim(); 
      if (!s) return null;
      const m = s.match(whitespaceRow);
      if (m) return {line: index + 1, cells: [m[1], m[2]], malformed: false};
      const headers = s.match(/^(date|day|timestamp|datetime)\s+(.+)$/i);
      return {line: index + 1, cells: headers ? [headers[1], headers[2]] : [s], malformed: false};
    }).filter(Boolean);
  }
  function chooseRows(raw) {
    // Compare structured rows and date/number evidence, not raw delimiter counts.
    const options = ["\t", ";", ",", "|", "whitespace"].map(delimiter => {
      const rows = delimiter === "whitespace" ? parseWhitespace(raw) : parseDelimited(raw, delimiter);
      const sample = rows.slice(0, 120);
      const counts = new Map();
      let pairs = 0, labels = 0, malformed = 0;
      for (const row of sample) {
        const cells = row.cells;
        if (row.malformed) { malformed++; continue; }
        if (cells.length < 2) continue;
        counts.set(cells.length, (counts.get(cells.length) || 0) + 1);
        if (cells.some(cell => dateShape(cell)) && cells.some(cell => {
          const w = weightToken(cell);
          return w && w.amount >= 20 && w.amount <= 1800;
        })) pairs++;
        if (cells.some(isDateLabel) && cells.some(cell => WEIGHT_LABEL.test(cell))) labels++;
      }
      const mode = Math.max(0, ...counts.values());
      const rank = (pairs * 5 + labels * 3 + mode - malformed) / Math.max(1, sample.length);
      return {rows, delimiter, rank};
    });
    return options.reduce((best, current) => current.rank > best.rank ? current : best);
  }
  function currentBrisbaneDay() {
    const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const item = t => parts.find(p => p.type === t).value;
    return item("year") + "-" + item("month") + "-" + item("day");
  }
  function columnOverride(value, width, fallback) { return Number.isInteger(value) && value >= 0 && value < width ? value : fallback; }
  
  function parseWeightData(raw, options = {}) {
    const dateOrder = ["dmy", "mdy", "ymd"].includes(options.dateOrder) ? options.dateOrder : "auto";
    const unit = ["kg", "lb"].includes(options.unit) ? options.unit : "auto";
    let notices = [];
    const empty = {headers: [], dateColumn: -1, weightColumn: -1, hasHeader: false, dateOrder, unit, detectedDateOrder: null, detectedUnit: null, dateAmbiguous: false, unitAmbiguous: false, entries: [], duplicateCount: 0, invalid: [], invalidCount: 0, sampleRows: [], notices, delimiter: null};
    raw = typeof raw === "string" ? raw.replace(/^\uFEFF/, "").trimEnd().replace(/\r\n?/g, "\n") : "";
    if (!raw.trim()) return empty;
    if (raw.length > maxChars) {
      notices.push("This paste is too large. Import in smaller batches.");
      return empty;
    }
    const {rows, delimiter} = chooseRows(raw);
    if (rows.length > maxRows) {
      notices.push("Import up to 30,000 rows per batch.");
      return {...empty, delimiter};
    }
    if (!rows.length) return {...empty, delimiter};
    const first = rows[0].cells;
    let width = Math.max(first.length, ...rows.slice(0, 120).map(row => row.cells.length));
    if (width > 256) {
      notices.push("This file has more than 256 columns. Keep only the date and weight columns and try again.");
      return {...empty, delimiter};
    }
    const hasHeader = typeof options.hasHeader === "boolean" ? options.hasHeader : (first.some(isDateLabel) || (!first.some(cell => dateShape(cell)) && first.some(cell => WEIGHT_LABEL.test(cell))));
    let sourceRows = hasHeader ? rows.slice(1) : rows;
    // A dashboard backup includes food rows and day-status rows; import its weights only.
    const ownHeaders = hasHeader ? first.map(h => h.toLowerCase()) : [];
    const typeColumn = ownHeaders.indexOf("type");
    if (typeColumn >= 0 && ["date", "description", "kg", "day_complete"].every(h => ownHeaders.includes(h))) {
      sourceRows = sourceRows.filter(row => row.malformed || String(row.cells[typeColumn] ?? "").toLowerCase() === "weight");
    }
    const headers = Array.from({length: width}, (_, i) => (hasHeader && first[i]) || "Column " + (i + 1));
    const sample = sourceRows.filter(row => !row.malformed).slice(0, 200);
    const indices = Array.from({length: width}, (_, i) => i);
    const dateAuto = indices.reduce((best, i) => {
      const count = sample.filter(row => dateShape(row.cells[i])).length;
      const rank = count + (hasHeader && isDateLabel(headers[i]) ? sample.length + 1 : 0);
      return rank > best.rank ? {i, rank} : best;
    }, {i: width ? 0 : -1, rank: 0}).i;
    const dateColumn = columnOverride(options.dateColumn, width, dateAuto);
    const weightAuto = indices.filter(i => i !== dateColumn && !(hasHeader && UNIT_LABEL.test(headers[i]))).reduce((best, i) => {
      const count = sample.filter(row => {
        const w = weightToken(row.cells[i]);
        return w && w.amount >= 20 && w.amount <= 1800;
      }).length;
      const rank = count + (hasHeader && !NON_WEIGHT_LABEL.test(headers[i]) ? (CLEAN_WEIGHT_LABEL.test(headers[i]) ? (sample.length + 1) * 2 : WEIGHT_LABEL.test(headers[i]) ? sample.length + 1 : 0) : hasHeader && NON_WEIGHT_LABEL.test(headers[i]) ? -(sample.length + 1) : 0);
      return rank > best.rank ? {i, rank} : best;
    }, {i: -1, rank: -Infinity}).i;
    const weightColumn = columnOverride(options.weightColumn, width, weightAuto);
    const unitColumn = hasHeader ? headers.findIndex((header, i) => i !== weightColumn && i !== dateColumn && UNIT_LABEL.test(header)) : -1;
    const today = typeof options.today === "string" && dateShape(options.today)?.day === options.today ? options.today : currentBrisbaneDay();
    const failMap = dateColumn < 0 || weightColumn < 0 || dateColumn === weightColumn;
    if (failMap) {
      notices.push("Choose different date and weight columns.");
      return {...empty, headers, dateColumn, weightColumn, hasHeader, sampleRows: sourceRows.slice(0, 5).map(r => r.cells), delimiter};
    }
    if (rows[0].malformed && hasHeader) notices.push("The header has a quoting problem. Check the selected columns.");
    
    const shaped = sourceRows.map(row => ({
      ...row,
      date: row.malformed ? null : dateShape(row.cells[dateColumn]),
      token: row.malformed ? null : weightToken(row.cells[weightColumn]),
      rowUnit: row.malformed || unitColumn < 0 ? null : unitIn(row.cells[unitColumn]),
      explicitUnit: row.malformed || unitColumn < 0 ? "" : String(row.cells[unitColumn] ?? "").trim(),
    }));
    const eligibleClues = shaped.filter(row => row.token && row.token.amount >= 20 && row.token.amount <= 1800 && row.date);
    const dmy = eligibleClues.some(row => row.date.type === "short" && row.date.dmy && !row.date.mdy);
    const mdy = eligibleClues.some(row => row.date.type === "short" && row.date.mdy && !row.date.dmy);
    const detectedDateOrder = dmy && mdy ? "mixed" : dmy ? "dmy" : mdy ? "mdy" : eligibleClues.some(row => row.date.type === "short") ? null : eligibleClues.some(row => row.date.day) ? "ymd" : null;
    const dateMode = dateOrder === "auto" && (detectedDateOrder === "dmy" || detectedDateOrder === "mdy") ? detectedDateOrder : dateOrder;
    if (dateOrder === "auto" && detectedDateOrder === "mixed") notices.push("The file contains both day-first and month-first dates. Unambiguous rows can be imported; dates that could mean either are skipped.");
    const headerUnit = hasHeader ? unitIn(headers[weightColumn]) : null;
    const observedUnits = new Set();
    for (const row of eligibleClues) {
      if (row.token.unit && row.rowUnit && row.token.unit !== row.rowUnit) continue;
      const u = row.token.unit || row.rowUnit;
      if (u) observedUnits.add(u);
    }
    const detectedUnit = observedUnits.size > 1 || (headerUnit && observedUnits.size === 1 && !observedUnits.has(headerUnit)) ? "mixed" : (headerUnit || [...observedUnits][0] || null);
    const defaultUnit = unit !== "auto" ? unit : headerUnit ?? (detectedUnit === "mixed" ? null : detectedUnit || "kg");
    let assumedKg = false, dateAmbiguous = false, unitAmbiguous = false, duplicateCount = 0, invalidCount = 0;
    const invalid = [], map = new Map();
    const reject = (line, reason) => { invalidCount++; if (invalid.length < 100) invalid.push({line, reason}); };
    for (const row of shaped) {
      if (row.malformed) {reject(row.line, "CSV quoting is invalid."); continue;}
      const parsed = dateFrom(row.date, dateMode);
      if (!parsed.day) {if (parsed.reason.startsWith("Ambiguous date") && row.token && row.token.amount >= 20 && row.token.amount <= 1800) dateAmbiguous = true; reject(row.line, parsed.reason); continue;}
      if (parsed.day > today) {reject(row.line, "Date is in the future."); continue;}
      if (!row.token) {reject(row.line, "Weight could not be read."); continue;}
      if (row.explicitUnit && !row.rowUnit) {reject(row.line, "Units column must say kilograms or pounds."); continue;}
      if (row.token.unit && row.rowUnit && row.token.unit !== row.rowUnit) {reject(row.line, "Weight and units column disagree."); continue;}
      const rowWeightUnit = row.token.unit || row.rowUnit || defaultUnit;
      if (!rowWeightUnit) {unitAmbiguous = true; reject(row.line, "Weight has no unit in a mixed-unit file. Select a unit for unlabelled rows."); continue;}
      if (unit === "auto" && !detectedUnit && !row.token.unit && !row.rowUnit) assumedKg = true;
      const kg = rowWeightUnit === "lb" ? row.token.amount * KG_PER_LB : row.token.amount;
      if (!Number.isFinite(kg) || kg < 20 || kg > 800) {reject(row.line, "Weight is outside the supported range of 20–800 kg."); continue;}
      if (map.has(parsed.day)) duplicateCount++;
      // Keep the last dated value in source order; the server separately protects saved dates.
      map.set(parsed.day, {day: parsed.day, kg: Math.round(kg * 1000) / 1000});
    }
    if (assumedKg) notices.push("No unit was found. Unlabelled weights are assumed to be kilograms; choose pounds if needed.");
    if (unit !== "auto" && headerUnit && unit !== headerUnit) notices.push("Your unit choice overrides the column label for unlabelled weights only.");
    if (unit !== "auto" && observedUnits.size) notices.push("Units written on individual rows are kept; your selection applies to unlabelled weights.");
    if (duplicateCount) notices.push("When a date appears more than once in this import, the last valid reading is used.");
    if (!sourceRows.length) notices.push("No data rows were found.");
    const entries = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
    return {headers, dateColumn, weightColumn, hasHeader, dateOrder, unit, detectedDateOrder, detectedUnit, dateAmbiguous, unitAmbiguous, entries, duplicateCount, invalid, invalidCount, sampleRows: sourceRows.slice(0, 5).map(r => r.cells), notices, delimiter};
  }
  
  root.parseWeightData = parseWeightData;
})(globalThis);
