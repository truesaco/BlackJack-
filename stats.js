// Stats dashboard: loads the signed-in player's hands and turns them into KPIs, charts and tables.
(() => {
  "use strict";

  const sb = window.sbClient;
  const { ACTION_NAMES } = window.BJStrategy;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PAGE_SIZE = 25;
  const OUTCOME = {
    win: { label: "Win", color: "var(--series-1)" },
    push: { label: "Push", color: "var(--series-3)" },
    lose: { label: "Loss", color: "var(--series-2)" },
  };
  const UP_LABELS = { 11: "A", 10: "10" };

  let allHands = [];
  let filtered = [];
  let page = 0;

  // ---------- Formatting ----------
  const fmtInt = (n) => Math.round(n).toLocaleString();
  const fmtMoney = (n) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
  const fmtMoney2 = (n) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
  const fmtPct = (n) => (Number.isFinite(n) ? `${n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(1)}%` : "–");
  const ratio = (a, b) => (b ? a / b : NaN);
  const isWin = (h) => h.outcome === "win" || h.outcome === "blackjack";
  const outcomeKey = (h) => (isWin(h) ? "win" : h.outcome);
  const upLabel = (v) => UP_LABELS[v] || String(v);

  function node(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v);
    }
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svg(tag, attrs = {}, text) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---------- Tooltip ----------
  const tip = $("tooltip");
  function showTip(evt, lines) {
    tip.replaceChildren();
    lines.forEach((line, i) => {
      const row = node("div", { class: "tt-row" });
      if (line.color) row.appendChild(node("span", { class: "key", style: `background:${line.color}` }));
      row.appendChild(node(i === 0 ? "strong" : "span", {}, line.text));
      tip.appendChild(row);
    });
    tip.hidden = false;
    const r = evt.clientX !== undefined && evt.clientX !== 0
      ? { x: evt.clientX, y: evt.clientY }
      : (() => { const b = evt.target.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.x + 14, y = r.y - h - 10;
    if (x + w > window.innerWidth - 8) x = r.x - w - 14;
    if (y < 8) y = r.y + 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- Axis helpers ----------
  function niceTicks(min, max, count = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }
  const tickLabel = (v, money) => {
    const abs = Math.abs(v);
    const s = abs >= 10000 ? `${(abs / 1000).toFixed(abs % 1000 ? 1 : 0)}K` : abs % 1 ? abs.toFixed(2) : abs.toLocaleString();
    return `${v < 0 ? "−" : ""}${money ? "$" : ""}${s}`;
  };

  // ---------- Line chart: cumulative profit ----------
  function lineChart(container, points) {
    container.replaceChildren();
    if (points.length < 2) {
      container.appendChild(node("p", { class: "chart-empty" }, "Play at least two hands to see the trend."));
      return;
    }
    const W = Math.max(container.clientWidth, 300), H = 240;
    const m = { t: 16, r: 56, b: 28, l: 56 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ys = points.map((p) => p.y);
    const ticks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const sx = (i) => m.l + (iw * i) / (points.length - 1);
    const sy = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cumulative profit by hand" });
    ticks.forEach((t) => {
      root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      root.appendChild(svg("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end", class: "axis-label" }, tickLabel(t, true)));
    });
    // x ticks: first, middle, last hand number
    [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach((i) => {
      root.appendChild(svg("text", { x: sx(i), y: H - 8, "text-anchor": "middle", class: "axis-label" }, `#${i + 1}`));
    });

    const d = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    root.appendChild(svg("path", { d: `${d}L${sx(points.length - 1)},${sy(0)}L${sx(0)},${sy(0)}Z`, fill: "var(--series-1)", opacity: 0.1 }));
    root.appendChild(svg("path", { d, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

    // end label + dot
    const last = points[points.length - 1];
    root.appendChild(svg("circle", { cx: sx(points.length - 1), cy: sy(last.y), r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 }));
    root.appendChild(svg("text", { x: sx(points.length - 1) + 8, y: sy(last.y) + 4, class: "value-label" }, tickLabel(last.y, true)));

    // crosshair
    const cross = svg("line", { y1: m.t, y2: m.t + ih, stroke: "var(--text-muted)", "stroke-width": 1, visibility: "hidden" });
    const marker = svg("circle", { r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" });
    root.append(cross, marker);
    const hit = svg("rect", { x: m.l, y: m.t, width: iw, height: ih, class: "hit", tabindex: 0 });
    let focusIdx = points.length - 1;
    const at = (i, evt) => {
      const p = points[i];
      cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
      marker.setAttribute("cx", sx(i)); marker.setAttribute("cy", sy(p.y)); marker.setAttribute("visibility", "visible");
      showTip(evt, [
        { text: fmtMoney(p.y), color: "var(--series-1)" },
        { text: `Hand #${i + 1} · ${p.label}` },
        { text: `This hand: ${fmtMoney(p.net)}` },
      ]);
    };
    hit.addEventListener("pointermove", (evt) => {
      const rect = root.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * W;
      focusIdx = Math.max(0, Math.min(points.length - 1, Math.round(((x - m.l) / iw) * (points.length - 1))));
      at(focusIdx, evt);
    });
    const leave = () => { cross.setAttribute("visibility", "hidden"); marker.setAttribute("visibility", "hidden"); hideTip(); };
    hit.addEventListener("pointerleave", leave);
    hit.addEventListener("blur", leave);
    hit.addEventListener("focus", (evt) => at(focusIdx, evt));
    hit.addEventListener("keydown", (evt) => {
      if (evt.key === "ArrowLeft") focusIdx = Math.max(0, focusIdx - 1);
      else if (evt.key === "ArrowRight") focusIdx = Math.min(points.length - 1, focusIdx + 1);
      else return;
      evt.preventDefault();
      at(focusIdx, { target: hit });
    });
    root.appendChild(hit);
    container.appendChild(root);
  }

  // ---------- Column chart: average net per hand by bucket (diverging sign) ----------
  function columnChart(container, buckets, { caption }) {
    container.replaceChildren();
    const withData = buckets.filter((b) => b.hands > 0);
    if (!withData.length) {
      container.appendChild(node("p", { class: "chart-empty" }, "Not enough hands yet."));
      return;
    }
    const W = Math.max(container.clientWidth, 280), H = 220;
    const m = { t: 18, r: 8, b: 30, l: 50 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = withData.map((b) => b.avg);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const sy = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const band = iw / buckets.length;
    const bw = Math.min(24, band * 0.7);

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": caption });
    ticks.forEach((t) => {
      root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      root.appendChild(svg("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end", class: "axis-label" }, tickLabel(t, true)));
    });
    // Skip every other axis label when they'd collide (≈6.5px per character at 11px).
    const widest = Math.max(...buckets.map((b) => b.label.length)) * 6.5 + 6;
    const showEvery = Math.ceil(widest / band);
    buckets.forEach((b, i) => {
      const cx = m.l + band * i + band / 2;
      if (i % showEvery === 0) root.appendChild(svg("text", { x: cx, y: H - 10, "text-anchor": "middle", class: "axis-label" }, b.label));
      if (!b.hands) return;
      const top = sy(Math.max(0, b.avg)), bottom = sy(Math.min(0, b.avg));
      const h = Math.max(1, bottom - top);
      const r = Math.min(4, h);
      const x = cx - bw / 2;
      const pos = b.avg >= 0;
      // 4px rounded data end, square at the zero baseline
      const d = pos
        ? `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${bottom}Z`
        : `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + bw - r}Q${x + bw},${bottom} ${x + bw},${bottom - r}V${top}Z`;
      const hitR = svg("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, class: "bar-hit", tabindex: 0, "aria-label": `${b.label}: ${fmtMoney2(b.avg)} per hand over ${b.hands} hands` });
      const bar = svg("path", { d, class: "bar", fill: pos ? "var(--series-1)" : "var(--neg)" });
      const tipLines = (evt) => showTip(evt, [
        { text: `${fmtMoney2(b.avg)} per hand`, color: pos ? "var(--series-1)" : "var(--neg)" },
        { text: `${b.long || b.label}` },
        { text: `${fmtInt(b.hands)} hands · win ${fmtPct(b.winRate)} · net ${fmtMoney(b.net)}` },
      ]);
      hitR.addEventListener("pointermove", tipLines);
      hitR.addEventListener("focus", tipLines);
      hitR.addEventListener("pointerleave", hideTip);
      hitR.addEventListener("blur", hideTip);
      root.append(hitR, bar);
    });
    container.appendChild(root);

    // Table view: every value reachable without hovering
    const det = node("details", { class: "chart-table" });
    det.appendChild(node("summary", {}, "Show as table"));
    det.appendChild(dataTable(
      [["Bucket"], ["Hands", "num"], ["Win %", "num"], ["Net", "num"], ["Net / hand", "num"]],
      withData.map((b) => [b.long || b.label, fmtInt(b.hands), fmtPct(b.winRate), money(b.net), money(b.avg, true)])
    ));
    container.appendChild(det);
  }

  // A cell value with sign colouring.
  const money = (v, cents) => ({ text: cents ? fmtMoney2(v) : fmtMoney(v), cls: v > 0 ? "num pos" : v < 0 ? "num neg" : "num" });

  function dataTable(headers, rows, target) {
    const table = target || node("table", { class: "data" });
    table.replaceChildren();
    const thead = node("thead");
    const tr = node("tr");
    headers.forEach(([h, cls]) => tr.appendChild(node("th", cls ? { class: cls } : {}, h)));
    thead.appendChild(tr);
    const tbody = node("tbody");
    rows.forEach((r) => {
      const row = node("tr");
      r.forEach((cell, i) => {
        if (cell instanceof Node) { const td = node("td"); td.appendChild(cell); row.appendChild(td); return; }
        const isObj = cell && typeof cell === "object";
        const cls = isObj ? cell.cls : headers[i][1];
        row.appendChild(node("td", cls ? { class: cls } : {}, isObj ? cell.text : String(cell)));
      });
      tbody.appendChild(row);
    });
    table.append(thead, tbody);
    return table;
  }

  // ---------- Aggregation ----------
  function summarize(hands) {
    const n = hands.length;
    const wins = hands.filter(isWin).length;
    const losses = hands.filter((h) => h.outcome === "lose").length;
    const pushes = n - wins - losses;
    const net = hands.reduce((s, h) => s + h.net, 0);
    const wagered = hands.reduce((s, h) => s + h.total_wagered, 0);
    return { n, wins, losses, pushes, net, wagered, winRate: ratio(wins, n), avg: ratio(net, n) };
  }

  function bucketize(hands, defs) {
    return defs.map((def) => {
      const hs = hands.filter(def.test);
      const s = summarize(hs);
      return { label: def.label, long: def.long, hands: s.n, net: s.net, avg: s.avg, winRate: s.winRate };
    });
  }

  function streaks(hands) {
    let bestW = 0, bestL = 0, cur = 0, curType = null;
    for (const h of hands) {
      if (h.outcome === "push") continue;
      const t = isWin(h) ? "W" : "L";
      cur = t === curType ? cur + 1 : 1;
      curType = t;
      if (t === "W") bestW = Math.max(bestW, cur); else bestL = Math.max(bestL, cur);
    }
    return { bestW, bestL, cur, curType };
  }

  // ---------- Render ----------
  function tile(label, value, note, cls) {
    const t = node("div", { class: "tile" });
    t.appendChild(node("div", { class: "tile-label" }, label));
    t.appendChild(node("div", { class: `tile-value ${cls || ""}`.trim() }, value));
    if (note) t.appendChild(node("div", { class: "tile-note" }, note));
    return t;
  }
  const signCls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

  function renderTiles(hands) {
    const s = summarize(hands);
    const bj = hands.filter((h) => h.player_blackjack).length;
    const busts = hands.filter((h) => h.player_bust).length;
    const dealerBusts = hands.filter((h) => h.dealer_bust).length;
    const doubles = hands.filter((h) => h.doubled);
    const dblWins = doubles.filter(isWin).length;
    const decisions = hands.reduce((a, h) => a + h.bs_decisions, 0);
    const matches = hands.reduce((a, h) => a + h.bs_matches, 0);
    const st = streaks(hands);
    const best = hands.reduce((m, h) => Math.max(m, h.net), 0);
    const worst = hands.reduce((m, h) => Math.min(m, h.net), 0);
    const avgBet = ratio(hands.reduce((a, h) => a + h.bet, 0), s.n);

    $("tiles").replaceChildren(
      tile("Hands played", fmtInt(s.n), (() => { const n = new Set(hands.map((h) => h.session_id)).size; return `${n} session${n === 1 ? "" : "s"}`; })()),
      tile("Net profit", fmtMoney(s.net), `${fmtMoney2(s.avg)} per hand`, signCls(s.net)),
      tile("Win rate", fmtPct(s.winRate), `${s.wins}W · ${s.losses}L · ${s.pushes}P`),
      tile("Return on wagers", fmtPct(ratio(s.net, s.wagered)), `on $${fmtInt(s.wagered)} wagered`, signCls(s.net)),
      tile("Basic strategy match", fmtPct(ratio(matches, decisions)), `${fmtInt(matches)} of ${fmtInt(decisions)} decisions`),
      tile("Average bet", Number.isFinite(avgBet) ? `$${avgBet.toFixed(0)}` : "–"),
      tile("Blackjacks", fmtInt(bj), `${fmtPct(ratio(bj, s.n))} of hands`),
      tile("You busted", fmtPct(ratio(busts, s.n)), `${busts} hands`),
      tile("Dealer busted", fmtPct(ratio(dealerBusts, s.n)), `${dealerBusts} hands`),
      tile("Double-down win rate", fmtPct(ratio(dblWins, doubles.length)), `${doubles.length} doubles`),
      tile("Best streaks", `${st.bestW}W / ${st.bestL}L`, st.curType ? `Current: ${st.cur}${st.curType}` : ""),
      tile("Biggest win / loss", `${fmtMoney(best)} / ${fmtMoney(worst)}`),
    );
  }

  function renderMix(hands) {
    const s = summarize(hands);
    const box = $("chart-mix");
    box.replaceChildren();
    $("mix-sub").textContent = `${fmtInt(s.n)} hands, including ${hands.filter((h) => h.outcome === "blackjack").length} blackjacks (counted as wins)`;
    const bar = node("div", { class: "mix-bar", role: "img", "aria-label": `Wins ${s.wins}, pushes ${s.pushes}, losses ${s.losses}` });
    const legend = node("div", { class: "legend" });
    [["win", s.wins], ["push", s.pushes], ["lose", s.losses]].forEach(([k, count]) => {
      const pct = ratio(count, s.n);
      if (count) {
        const seg = node("div", { class: "mix-seg", style: `flex:${count};background:${OUTCOME[k].color}`, tabindex: 0 });
        const label = node("span", {}, fmtPct(pct));
        seg.appendChild(label);
        const tipFn = (evt) => showTip(evt, [{ text: fmtPct(pct), color: OUTCOME[k].color }, { text: `${OUTCOME[k].label}: ${count} hands` }]);
        seg.addEventListener("pointermove", tipFn);
        seg.addEventListener("focus", tipFn);
        seg.addEventListener("pointerleave", hideTip);
        seg.addEventListener("blur", hideTip);
        bar.appendChild(seg);
        // Only keep the inline label if it fits.
        requestAnimationFrame(() => { if (label.scrollWidth > seg.clientWidth - 4) label.remove(); });
      }
      const item = node("span", { class: "legend-item" });
      item.append(node("span", { class: "swatch", style: `background:${OUTCOME[k].color}` }), document.createTextNode(`${OUTCOME[k].label} ${count} (${fmtPct(pct)})`));
      legend.appendChild(item);
    });
    box.append(bar, legend);
  }

  function renderCharts(hands) {
    let cum = 0;
    lineChart($("chart-profit"), hands.map((h) => {
      cum += h.net;
      return { y: cum, net: h.net, label: `${h.player_cards.join(" ")} vs ${h.dealer_cards.join(" ")}` };
    }));

    columnChart($("chart-upcard"), bucketize(hands, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((v) => ({
      label: upLabel(v), long: `Dealer shows ${v === 11 ? "an ace" : v === 10 ? "a 10 / face card" : `a ${v}`}`, test: (h) => h.dealer_up_value === v,
    }))), { caption: "Average profit per hand by dealer upcard" });

    const hard = (lo, hi, label) => ({ label, long: `Hard ${lo === hi ? lo : `${lo}–${hi}`}`, test: (h) => !h.start_soft && !h.player_blackjack && h.start_total >= lo && h.start_total <= hi });
    const soft = (lo, hi, label) => ({ label, long: `Soft ${lo === hi ? lo : `${lo}–${hi}`}`, test: (h) => h.start_soft && !h.player_blackjack && h.start_total >= lo && h.start_total <= hi });
    columnChart($("chart-start"), bucketize(hands, [
      hard(4, 8, "≤8"), hard(9, 9, "9"), hard(10, 10, "10"), hard(11, 11, "11"), hard(12, 12, "12"),
      hard(13, 14, "13-14"), hard(15, 16, "15-16"), hard(17, 18, "17-18"), hard(19, 20, "19-20"),
      soft(12, 16, "A,≤5"), soft(17, 18, "A,6-7"), soft(19, 20, "A,8-9"),
      { label: "BJ", long: "Blackjack", test: (h) => h.player_blackjack },
    ]), { caption: "Average profit per hand by starting hand" });

    const tc = (lo, hi, label) => ({ label, long: `True count ${label}`, test: (h) => h.true_count >= lo && h.true_count < hi });
    columnChart($("chart-count"), bucketize(hands, [
      tc(-99, -2.5, "≤−3"), tc(-2.5, -1.5, "−2"), tc(-1.5, -0.5, "−1"), tc(-0.5, 0.5, "0"),
      tc(0.5, 1.5, "+1"), tc(1.5, 2.5, "+2"), tc(2.5, 99, "≥+3"),
    ]), { caption: "Average profit per hand by true count" });
  }

  function renderStrategies(hands) {
    const groups = new Map();
    hands.forEach((h) => { if (!groups.has(h.strategy)) groups.set(h.strategy, []); groups.get(h.strategy).push(h); });
    const rows = [...groups.entries()]
      .map(([name, hs]) => {
        const s = summarize(hs);
        const dec = hs.reduce((a, h) => a + h.bs_decisions, 0);
        const mat = hs.reduce((a, h) => a + h.bs_matches, 0);
        return { name, s, bsRate: ratio(mat, dec), avgBet: ratio(hs.reduce((a, h) => a + h.bet, 0), s.n), busts: ratio(hs.filter((h) => h.player_bust).length, s.n) };
      })
      .sort((a, b) => b.s.n - a.s.n);
    dataTable(
      [["Strategy"], ["Hands", "num"], ["Win %", "num"], ["Bust %", "num"], ["Net", "num"], ["Net / hand", "num"], ["Return", "num"], ["Avg bet", "num"], ["Basic match", "num"]],
      rows.map((r) => [r.name, fmtInt(r.s.n), fmtPct(r.s.winRate), fmtPct(r.busts), money(r.s.net), money(r.s.avg, true),
        { text: fmtPct(ratio(r.s.net, r.s.wagered)), cls: `num ${signCls(r.s.net)}` }, `$${r.avgBet.toFixed(0)}`, fmtPct(r.bsRate)]),
      $("strategy-table")
    );
  }

  function situation(d) {
    return `${d.soft ? "Soft" : "Hard"} ${d.total} vs ${upLabel(d.dealer_up)}`;
  }

  function renderDecisions(hands) {
    const decided = hands.filter((h) => h.bs_decisions > 0);
    const followed = decided.filter((h) => h.bs_matches === h.bs_decisions);
    const deviated = decided.filter((h) => h.bs_matches < h.bs_decisions);
    const sf = summarize(followed), sd = summarize(deviated);
    const totalDec = hands.reduce((a, h) => a + h.bs_decisions, 0);
    $("decision-sub").textContent = `${fmtInt(totalDec)} decisions across ${fmtInt(decided.length)} hands. Hands ending in an immediate blackjack had no decision to make.`;
    $("decision-tiles").replaceChildren(
      tile("Hands played by the book", fmtInt(sf.n), `${fmtMoney2(sf.avg || 0)} per hand · win ${fmtPct(sf.winRate)}`),
      tile("Hands with a deviation", fmtInt(sd.n), `${fmtMoney2(sd.avg || 0)} per hand · win ${fmtPct(sd.winRate)}`),
      tile("Hit decisions", fmtInt(hands.reduce((a, h) => a + (h.actions.match(/H/g) || []).length, 0))),
      tile("Stand decisions", fmtInt(hands.reduce((a, h) => a + (h.actions.match(/S/g) || []).length, 0))),
    );

    const dev = new Map();
    hands.forEach((h) => (h.decisions || []).forEach((d) => {
      if (d.matches_basic) return;
      const key = `${situation(d)}|${d.action}|${d.basic_strategy}`;
      if (!dev.has(key)) dev.set(key, { sit: situation(d), you: d.action, bs: d.basic_strategy, count: 0, hands: new Set() });
      const e = dev.get(key); e.count++; e.hands.add(h);
    }));
    const rows = [...dev.values()].sort((a, b) => b.count - a.count).slice(0, 12);
    if (!rows.length) {
      dataTable([["Situation"]], [[totalDec ? "No deviations — every decision matched basic strategy." : "No decisions recorded yet."]], $("deviation-table"));
      return;
    }
    dataTable(
      [["Situation"], ["You chose"], ["Basic strategy says"], ["Times", "num"], ["Net on those hands", "num"], ["Win %", "num"]],
      rows.map((r) => {
        const s = summarize([...r.hands]);
        return [r.sit, ACTION_NAMES[r.you], ACTION_NAMES[r.bs], fmtInt(r.count), money(s.net), fmtPct(s.winRate)];
      }),
      $("deviation-table")
    );
  }

  function renderHistory() {
    const newest = filtered.slice().reverse();
    const pages = Math.max(1, Math.ceil(newest.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const slice = newest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    dataTable(
      [["When"], ["Strategy"], ["Your cards"], ["Dealer"], ["Decisions"], ["TC", "num"], ["Bet", "num"], ["Result"], ["Net", "num"]],
      slice.map((h) => {
        const res = node("span", { class: "result-pill" });
        res.append(node("span", { class: "dot", style: `background:${OUTCOME[outcomeKey(h)].color}` }), document.createTextNode(h.outcome === "blackjack" ? "Blackjack" : OUTCOME[outcomeKey(h)].label));
        const acts = (h.decisions || []).map((d) => `${ACTION_NAMES[d.action]}${d.matches_basic ? "" : " ⚠"}`).join(" → ") || "—";
        const actCell = node("span", { title: (h.decisions || []).map((d) => `${situation(d)}: ${ACTION_NAMES[d.action]} (basic: ${ACTION_NAMES[d.basic_strategy]})`).join("\n") }, acts);
        if (acts.includes("⚠")) actCell.className = "dev";
        return [
          new Date(h.played_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
          h.strategy,
          `${h.player_cards.join(" ")} (${h.player_total})`,
          `${h.dealer_cards.join(" ")} (${h.dealer_total})`,
          actCell,
          Number(h.true_count).toFixed(1),
          `$${fmtInt(h.total_wagered)}`,
          res,
          money(h.net),
        ];
      }),
      $("history-table")
    );
    $("page-info").textContent = `Page ${page + 1} of ${pages}`;
    $("prev-page").disabled = page === 0;
    $("next-page").disabled = page >= pages - 1;
  }

  // ---------- Filters ----------
  function fillFilterOptions() {
    const strat = $("f-strategy");
    const strategies = [...new Set(allHands.map((h) => h.strategy))].sort();
    strategies.forEach((s) => strat.appendChild(node("option", { value: s }, s)));

    const sess = $("f-session");
    const sessions = new Map();
    allHands.forEach((h) => {
      const e = sessions.get(h.session_id) || { start: h.played_at, n: 0 };
      e.n++; sessions.set(h.session_id, e);
    });
    [...sessions.entries()]
      .sort((a, b) => (a[1].start < b[1].start ? 1 : -1))
      .forEach(([id, e]) => sess.appendChild(node("option", { value: id },
        `${new Date(e.start).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (${e.n} hands)`)));
  }

  function applyFilters() {
    const range = $("f-range").value;
    const strat = $("f-strategy").value;
    const sess = $("f-session").value;
    let since = 0;
    if (range !== "all") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (Number(range) - 1));
      since = d.getTime();
    }
    filtered = allHands.filter((h) =>
      (strat === "all" || h.strategy === strat) &&
      (sess === "all" || h.session_id === sess) &&
      (!since || Date.parse(h.played_at) >= since));
    page = 0;
    render();
  }

  function render() {
    const empty = filtered.length === 0;
    $("empty").classList.toggle("hidden", !empty);
    $("panels").classList.toggle("hidden", empty);
    if (empty) return;
    renderTiles(filtered);
    renderMix(filtered);
    renderCharts(filtered);
    renderStrategies(filtered);
    renderDecisions(filtered);
    renderHistory();
  }

  // ---------- Export ----------
  const CSV_COLUMNS = [
    "id", "played_at", "session_id", "hand_in_session", "strategy", "bet", "total_wagered", "payout", "net",
    "bankroll_before", "bankroll_after", "outcome", "reason", "player_cards", "dealer_cards", "player_total",
    "dealer_total", "start_total", "start_soft", "start_pair", "dealer_upcard", "dealer_up_value", "actions",
    "doubled", "player_bust", "dealer_bust", "player_blackjack", "dealer_blackjack", "bs_decisions", "bs_matches",
    "running_count", "true_count", "shoe_remaining", "decks", "duration_ms", "decisions",
  ];
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join(" ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function download(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = node("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $("export-csv").addEventListener("click", () => {
    const lines = [CSV_COLUMNS.join(",")].concat(filtered.map((h) => CSV_COLUMNS.map((c) => csvCell(h[c])).join(",")));
    download(`blackjack-hands-${stamp()}.csv`, "text/csv", lines.join("\n"));
  });
  $("export-json").addEventListener("click", () => {
    download(`blackjack-hands-${stamp()}.json`, "application/json", JSON.stringify(filtered, null, 2));
  });

  $("delete-all").addEventListener("click", async () => {
    if (!confirm(`Permanently delete all ${allHands.length} saved hands? This can't be undone. Export first if you want a copy.`)) return;
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("hands").delete().eq("user_id", user.id);
    if (error) { alert(`Couldn't delete: ${error.message}`); return; }
    allHands = []; filtered = [];
    render();
  });

  ["f-range", "f-strategy", "f-session"].forEach((id) => $(id).addEventListener("change", applyFilters));
  $("prev-page").addEventListener("click", () => { page--; renderHistory(); });
  $("next-page").addEventListener("click", () => { page++; renderHistory(); });
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => filtered.length && renderCharts(filtered), 150); });

  // ---------- Load ----------
  async function fetchAll() {
    const rows = [];
    const step = 1000;
    for (let from = 0; ; from += step) {
      const { data, error } = await sb.from("hands").select("*").order("played_at", { ascending: true }).range(from, from + step - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < step) break;
    }
    return rows;
  }

  async function init() {
    const status = $("status");
    if (!sb) { status.textContent = "Couldn't load the sign-in service. Check your connection and refresh."; return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      status.replaceChildren(document.createTextNode("Sign in to see your stats. "), node("a", { href: "index.html" }, "Go to sign-in"));
      return;
    }
    try {
      allHands = await fetchAll();
    } catch (err) {
      status.textContent = `Couldn't load your hands: ${err.message}`;
      return;
    }
    status.classList.add("hidden");
    $("content").classList.remove("hidden");
    fillFilterOptions();
    applyFilters();
  }

  init();
})();
