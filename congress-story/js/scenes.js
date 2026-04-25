// Scene render functions. Each is called with a context { svg, overlay, readout, data, congress }
// and must own the entire viz stage while active. Scenes that share a viz type can share state
// (handled via the `viz` attribute on each .scene element).

(function (global) {
  const PARTY_COLOR = { D: "#2f6cb1", R: "#b8323a", I: "#6b6b6b", W: "#7a5c8c", F: "#c08a3e", Other: "#4a4a4a" };
  const PARTY_FULL = { D: "Democrat", R: "Republican", I: "Independent", W: "Whig", F: "Federalist" };

  // Featured Congresses for the comparison scenes.
  const REFERENCE_CONGRESS = 119;     // current
  const COMPARE_CONGRESS = 88;        // 1963-64, civil rights era

  function clear(svg) {
    d3.select(svg).selectAll("*").remove();
  }

  function clearOverlay(overlay) {
    overlay.innerHTML = "";
  }

  function clearControls(ctx) {
    if (ctx.controls) ctx.controls.innerHTML = "";
  }

  function setReadout(readout, items) {
    readout.innerHTML = items.map(([label, value]) => `
      <div class="readout-cell">
        <div class="readout-label">${label}</div>
        <div class="readout-value">${value}</div>
      </div>
    `).join("");
  }

  function dims(svg) {
    const r = svg.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function partyClass(p) {
    return PARTY_COLOR[p] ? p : "Other";
  }

  // -------------------- SCENE 1: intro grid (with photos when available) --------------------
  function renderIntro(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    setReadout(readout, [
      ["Senators", "100"],
      ["Congress shown", "119"],
      ["Photos available", `${data.photoSet ? data.photoSet.size : 0}`],
    ]);

    const c = data.byCongress.get(REFERENCE_CONGRESS);
    // Stable grid order: alphabetical so the same person sits in the same cell every render.
    const senators = c.senators.slice().sort((a, b) => a.name.localeCompare(b.name));

    const { w, h } = dims(svg);
    const cols = 10, rows = 10;
    const pad = Math.min(w, h) * 0.04;
    const cellSize = Math.min((w - pad * 2) / cols, (h - pad * 2) / rows) - 4;
    const gridW = cellSize * cols + 4 * (cols - 1);
    const gridH = cellSize * rows + 4 * (rows - 1);
    const x0 = (w - gridW) / 2;
    const y0 = (h - gridH) / 2;

    const root = d3.select(svg).append("g");
    const items = senators.slice(0, 100).map((s, i) => ({
      s,
      i,
      cx: x0 + (i % cols) * (cellSize + 4),
      cy: y0 + Math.floor(i / cols) * (cellSize + 4),
    }));

    const groups = root.selectAll("g.senator-tile").data(items).enter().append("g")
      .attr("class", "senator-tile")
      .attr("transform", d => `translate(${d.cx},${d.cy})`)
      .style("opacity", 0);

    groups.append("rect")
      .attr("width", cellSize).attr("height", cellSize)
      .attr("rx", 3).attr("fill", "#e8e3d7");

    // If a photo exists, embed it; otherwise leave the rect as-is.
    groups.each(function (d) {
      if (data.photoSet && data.photoSet.has(d.s.bioguide)) {
        d3.select(this).append("image")
          .attr("href", `assets/photos/${d.s.bioguide}.jpg`)
          .attr("width", cellSize).attr("height", cellSize)
          .attr("preserveAspectRatio", "xMidYMid slice");
      } else {
        d3.select(this).append("circle")
          .attr("cx", cellSize / 2).attr("cy", cellSize / 2)
          .attr("r", cellSize * 0.18).attr("fill", "#9a948a");
      }
    });

    // Tooltip on hover.
    groups.on("mouseover", function (event, d) {
      d3.select(this).select("rect").attr("stroke", "var(--ink)").attr("stroke-width", 2);
      const lastName = d.s.name.split(",")[0];
      showTileTooltip(ctx, `${lastName} (${d.s.party}-${d.s.state})`);
    }).on("mouseout", function () {
      d3.select(this).select("rect").attr("stroke", null);
      hideTileTooltip(ctx);
    });

    groups.transition().delay((d, i) => i * 8).duration(300).style("opacity", 1);
  }

  let _tileTooltip = null;
  function showTileTooltip(ctx, text) {
    if (!_tileTooltip) {
      _tileTooltip = document.createElement("div");
      _tileTooltip.className = "senator-card";
      _tileTooltip.style.width = "auto";
      _tileTooltip.style.padding = "6px 12px";
      ctx.overlay.appendChild(_tileTooltip);
    }
    _tileTooltip.innerHTML = `<div class="name" style="font-size:14px">${escapeHtml(text)}</div>`;
  }
  function hideTileTooltip(ctx) {
    if (_tileTooltip) _tileTooltip.remove();
    _tileTooltip = null;
  }

  // -------------------- SCENE 2: vote matrix --------------------
  function renderMatrix(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    const m = data.matrix;
    setReadout(readout, [
      ["Congress", m.congress],
      ["Senators (rows)", m.n_senators],
      ["Bills (columns)", m.n_bills],
      ["Cells", (m.n_senators * m.n_bills).toLocaleString()],
    ]);

    // Build a row-order permutation that sorts SENATORS ALPHABETICALLY, so we don't
    // visually pre-reveal the party structure (which scene 6 will reveal via PCA).
    const order = m.senators.map((s, i) => i)
      .sort((a, b) => m.senators[a].name.localeCompare(m.senators[b].name));

    const { w, h } = dims(svg);
    const N = m.n_senators;
    const M = m.n_bills;
    const cellW = w / M;
    const cellH = h / N;
    const root = d3.select(svg).append("g");

    for (let i = 0; i < N; i++) {
      const srcRow = order[i];
      const rowStr = m.matrix[srcRow];
      const row = root.append("g").attr("transform", `translate(0,${i * cellH})`);
      const rects = [];
      for (let j = 0; j < M; j++) {
        const ch = rowStr.charCodeAt(j);
        if (ch === 121 /* y */) rects.push({ x: j * cellW, cls: "yea" });
        else if (ch === 110 /* n */) rects.push({ x: j * cellW, cls: "nay" });
        // '-' (missing) — leave blank
      }
      row.selectAll("rect").data(rects).enter().append("rect")
        .attr("class", d => `matrix-cell ${d.cls}`)
        .attr("x", d => d.x)
        .attr("y", 0)
        .attr("width", Math.max(cellW * 0.95, 1))
        .attr("height", Math.max(cellH * 0.95, 1))
        .style("opacity", 0)
        .transition().delay(i * 4).duration(400).style("opacity", 0.85);
    }
  }

  // -------------------- SCENE 3: single bill --------------------
  function renderSingleBill(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    const m = data.matrix;
    const billIdx = m.scene_3_bill;
    const bill = m.bills[billIdx];

    // Alphabetical row order, same as scene 2.
    const order = m.senators.map((_, i) => i)
      .sort((a, b) => m.senators[a].name.localeCompare(m.senators[b].name));

    let yeas = 0, nays = 0, abs = 0;
    const cells = order.map(srcRow => {
      const ch = m.matrix[srcRow].charCodeAt(billIdx);
      if (ch === 121) { yeas++; return "yea"; }
      if (ch === 110) { nays++; return "nay"; }
      abs++; return "abs";
    });

    setReadout(readout, [
      ["Bill", bill.bill_number || `RC ${bill.rollnumber}`],
      ["Date", (bill.date || "").slice(0, 10)],
      ["Yea", yeas],
      ["Nay", nays],
      ["Absent", abs],
    ]);

    const { w, h } = dims(svg);
    const root = d3.select(svg).append("g");
    const N = cells.length;
    const cellH = Math.min(24, (h - 80) / N);
    const colW = 80;
    const x0 = w / 2 - colW / 2;
    const y0 = (h - cellH * N) / 2 + 12;

    root.selectAll("rect").data(cells).enter().append("rect")
      .attr("class", d => `matrix-cell ${d}`)
      .attr("x", x0)
      .attr("y", (d, i) => y0 + i * cellH)
      .attr("width", colW)
      .attr("height", cellH * 0.85)
      .style("opacity", 0)
      .transition().delay((d, i) => i * 8).duration(300).style("opacity", 0.9);

    // Title — short summary of what the vote was about.
    const desc = (bill.vote_desc || bill.vote_question || "").slice(0, 90);
    root.append("text")
      .attr("x", w / 2).attr("y", y0 - 22).attr("text-anchor", "middle")
      .attr("class", "axis-label").text("ONE BILL → 100 SENATORS");
    root.append("text")
      .attr("x", w / 2).attr("y", y0 + cellH * N + 24).attr("text-anchor", "middle")
      .attr("class", "axis-label")
      .style("font-style", "italic").style("text-transform", "none")
      .style("font-size", "11px")
      .text(desc);
  }

  // -------------------- SCENE 4: two bills as axes --------------------
  function renderTwoBills(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    const m = data.matrix;
    const [aIdx, bIdx] = m.scene_4_bills;
    const billA = m.bills[aIdx];
    const billB = m.bills[bIdx];

    // Read each senator's vote on bills A and B from the real matrix.
    const codeToVote = ch => ch === 121 ? 1 : ch === 110 ? -1 : 0;
    const senators = m.senators.map((s, i) => ({
      ...s,
      va: codeToVote(m.matrix[i].charCodeAt(aIdx)),
      vb: codeToVote(m.matrix[i].charCodeAt(bIdx)),
    }));

    setReadout(readout, [
      ["Bill A", billA.bill_number || `RC ${billA.rollnumber}`],
      ["Bill B", billB.bill_number || `RC ${billB.rollnumber}`],
      ["Possible positions", "9"],
      ["Dimensions kept", `2 of ${m.n_bills}`],
    ]);

    const { w, h } = dims(svg);
    const margin = { top: 40, right: 40, bottom: 80, left: 60 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    const root = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xs = [-1, 0, 1];
    const x = d3.scalePoint().domain(xs).range([0, innerW]).padding(0.5);
    const y = d3.scalePoint().domain(xs).range([innerH, 0]).padding(0.5);

    root.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(d => d === 1 ? "Yea" : d === -1 ? "Nay" : "—"));
    root.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).tickFormat(d => d === 1 ? "Yea" : d === -1 ? "Nay" : "—"));
    root.append("text").attr("class", "axis-label").attr("text-anchor", "middle")
      .attr("x", innerW / 2).attr("y", innerH + 36)
      .text(`Bill A — ${(billA.vote_desc || "").slice(0, 50)}`);
    root.append("text").attr("class", "axis-label").attr("text-anchor", "middle")
      .attr("transform", `translate(-44,${innerH / 2}) rotate(-90)`)
      .text(`Bill B — ${(billB.vote_desc || "").slice(0, 50)}`);

    // Jitter to disambiguate overlapping dots.
    const rng = mulberry32(7);
    senators.forEach(s => { s._jx = (rng() - 0.5) * 50; s._jy = (rng() - 0.5) * 50; });
    root.selectAll("circle").data(senators).enter().append("circle")
      .attr("class", d => `dot ${partyClass(d.party)}`)
      .attr("cx", d => x(d.va) + d._jx)
      .attr("cy", d => y(d.vb) + d._jy)
      .attr("r", 0)
      .style("opacity", 0.7)
      .transition().duration(500).attr("r", 6);
  }

  // -------------------- SCENE 5: math --------------------
  function renderMath(ctx) {
    const { svg, overlay, readout } = ctx;
    clear(svg);
    clearOverlay(overlay);
    setReadout(readout, [
      ["Method", "PCA"],
      ["Step 1", "center"],
      ["Step 2", "covariance"],
      ["Step 3", "eigendecomposition"],
    ]);
    const block = document.getElementById("math-block");
    if (block && !block.dataset.rendered) {
      const tex = String.raw`\Sigma = \frac{1}{N}\, X^{\top} X \qquad \Sigma\, v_k = \lambda_k\, v_k`;
      try {
        katex.render(tex, block, { displayMode: true, throwOnError: false });
        block.dataset.rendered = "1";
      } catch (e) { block.textContent = tex; }
    }

    // Animate axes rotating into "max-variance" position over a synthetic blob.
    const { w, h } = dims(svg);
    const cx = w / 2, cy = h / 2;
    const root = d3.select(svg).append("g").attr("transform", `translate(${cx},${cy})`);
    const rng = mulberry32(3);
    const blob = d3.range(120).map(() => {
      const a = (rng() - 0.5) * 220;
      const b = (rng() - 0.5) * 60;
      return { x: a, y: b };
    });
    // Rotate blob by 25 degrees so the optimal axis is tilted.
    const theta = -25 * Math.PI / 180;
    const ct = Math.cos(theta), st = Math.sin(theta);
    blob.forEach(p => { const x = p.x * ct - p.y * st; const y = p.x * st + p.y * ct; p.x = x; p.y = y; });

    root.selectAll("circle").data(blob).enter().append("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 3.5).attr("fill", "#9a948a").style("opacity", 0.7);

    const axisLen = 200;
    const axisG = root.append("g");
    function drawAxes(angleDeg) {
      const t = angleDeg * Math.PI / 180;
      const dx = Math.cos(t) * axisLen, dy = Math.sin(t) * axisLen;
      axisG.selectAll("*").remove();
      axisG.append("line").attr("x1", -dx).attr("y1", -dy).attr("x2", dx).attr("y2", dy)
        .attr("stroke", "#1a1a1a").attr("stroke-width", 2).attr("marker-end", "url(#arrow)");
      const px = -Math.sin(t) * axisLen * 0.5, py = Math.cos(t) * axisLen * 0.5;
      axisG.append("line").attr("x1", -px).attr("y1", -py).attr("x2", px).attr("y2", py)
        .attr("stroke", "#1a1a1a").attr("stroke-width", 2).attr("opacity", 0.4);
    }
    let angle = 60;
    drawAxes(angle);
    const t = d3.timer(elapsed => {
      const target = -25;
      const a = 60 + (target - 60) * Math.min(elapsed / 1800, 1);
      drawAxes(a);
      if (elapsed > 1800) { drawAxes(target); t.stop(); }
    });
  }

  // -------------------- SCENES 6, 7, 8: PCA scatter --------------------
  // Owns a persistent scatter and toggles between sub-states (reveal / party / time).
  let scatter = null;
  let scatterCongressIdx = null;
  let scatterCurrent = null;
  let _hoverCard = null;

  function ensureScatter(ctx) {
    if (scatter) return;
    const { svg } = ctx;
    clear(svg);
    scatter = createScatter(svg, {
      onHover: (s, node) => showCard(ctx, s),
      onLeave: () => hideCard(ctx),
    });
    scatter.setDomains(globalExtent(ctx.data.congresses));
  }

  function showCard(ctx, s) {
    if (!_hoverCard) {
      _hoverCard = document.createElement("div");
      _hoverCard.className = "senator-card";
      ctx.overlay.appendChild(_hoverCard);
    }
    const partyName = PARTY_FULL[s.party] || s.party;
    const partyColor = PARTY_COLOR[s.party] || "#4a4a4a";
    const fmt = v => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2);
    const hasPhoto = ctx.data.photoSet && ctx.data.photoSet.has(s.bioguide);
    const photoHtml = hasPhoto
      ? `<img class="photo" src="assets/photos/${s.bioguide}.jpg" alt="">`
      : "";
    _hoverCard.innerHTML = `
      ${photoHtml}
      <div class="name">${escapeHtml(s.name)}</div>
      <div class="meta"><span class="pill" style="background:${partyColor}">${partyName}</span> ${escapeHtml(s.state)}</div>
      <dl>
        <dt>PC1</dt><dd>${fmt(s.pc1)}</dd>
        <dt>PC2</dt><dd>${fmt(s.pc2)}</dd>
        <dt>NOMINATE 1</dt><dd>${fmt(s.nominate_dim1)}</dd>
        <dt>NOMINATE 2</dt><dd>${fmt(s.nominate_dim2)}</dd>
        <dt>k-means cluster</dt><dd>${s.kmeans_cluster}</dd>
      </dl>
    `;
  }

  function hideCard(ctx) {
    if (_hoverCard) _hoverCard.remove();
    _hoverCard = null;
  }

  function applyScatter(ctx, congressNum, opts = {}) {
    const c = ctx.data.byCongress.get(congressNum);
    scatter.update(c.senators, opts.transitionMs ?? 600, { gray: opts.gray });
    scatterCurrent = c;
    setReadout(ctx.readout, [
      ["Congress", c.congress],
      ["Years", `${c.year_start}–${String(c.year_end).slice(-2)}`],
      ["PC1 explains", (c.explained_variance_ratio[0] * 100).toFixed(1) + "%"],
      ["PC2 explains", (c.explained_variance_ratio[1] * 100).toFixed(1) + "%"],
      ["k-means ARI", c.kmeans_ari == null ? "—" : c.kmeans_ari.toFixed(2)],
    ]);
  }

  function renderScatterReveal(ctx) {
    ensureScatter(ctx);
    clearOverlay(ctx.overlay);
    applyScatter(ctx, REFERENCE_CONGRESS, { gray: true, transitionMs: 800 });
  }

  function renderScatterParty(ctx) {
    ensureScatter(ctx);
    clearOverlay(ctx.overlay);
    applyScatter(ctx, REFERENCE_CONGRESS, { gray: false });
  }

  function renderScatterTime(ctx) {
    ensureScatter(ctx);
    if (scatterCongressIdx == null) {
      scatterCongressIdx = ctx.data.orderedNums.indexOf(REFERENCE_CONGRESS);
      if (scatterCongressIdx < 0) scatterCongressIdx = ctx.data.orderedNums.length - 1;
    }
    applyScatter(ctx, ctx.data.orderedNums[scatterCongressIdx], { gray: false });

    // Build the time-slider DOM in the dedicated controls slot below the viz stage.
    // (Previously this lived inside the absolutely-positioned overlay, which produced
    // a dead input on some layouts.)
    const host = ctx.controls;
    host.innerHTML = "";
    // Also ensure the floating overlay can't accidentally cover the slider.
    ctx.overlay.innerHTML = "";

    // Build via raw HTML so the parser handles attribute parsing exactly as
    // it would for static markup. We've tried createElement, with the same
    // symptom; the simplest, most browser-canonical path is innerHTML with
    // attributes set inline.
    const maxIdx = ctx.data.orderedNums.length - 1;
    // Custom DIV slider — sidesteps a Chrome/extension issue where
    // <input type="range"> received pointer events but didn't drag.
    host.innerHTML = `
      <div class="time-slider">
        <div class="row">
          <button type="button" id="ts-play" aria-label="Play">▶</button>
          <button type="button" id="ts-prev" aria-label="Previous Congress">‹</button>
          <div class="track" id="ts-track" tabindex="0" role="slider"
               aria-valuemin="0" aria-valuemax="${maxIdx}" aria-valuenow="${scatterCongressIdx}">
            <div class="track-fill" id="ts-fill"></div>
            <div class="track-thumb" id="ts-thumb"></div>
          </div>
          <button type="button" id="ts-next" aria-label="Next Congress">›</button>
          <div class="label" id="ts-label">Congress —</div>
        </div>
      </div>`;
    const playBtn = host.querySelector("#ts-play");
    const prevBtn = host.querySelector("#ts-prev");
    const nextBtn = host.querySelector("#ts-next");
    const track   = host.querySelector("#ts-track");
    const fill    = host.querySelector("#ts-fill");
    const thumb   = host.querySelector("#ts-thumb");
    const label   = host.querySelector("#ts-label");

    function setUI(i) {
      const pct = maxIdx > 0 ? (i / maxIdx) * 100 : 0;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
      track.setAttribute("aria-valuenow", String(i));
    }

    function paint(i, ms = 400) {
      scatterCongressIdx = i;
      const num = ctx.data.orderedNums[i];
      applyScatter(ctx, num, { gray: false, transitionMs: ms });
      const cn = ctx.data.byCongress.get(num);
      label.textContent = `Congress ${cn.congress} · ${cn.year_start}`;
      setUI(i);
    }
    paint(scatterCongressIdx, 0);

    function valueAt(clientX) {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return scatterCongressIdx;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * maxIdx);
    }

    let dragging = false;
    track.addEventListener("pointerdown", e => {
      dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
      const v = valueAt(e.clientX);
      if (v !== scatterCongressIdx) paint(v, 0);
      e.preventDefault();
    });
    track.addEventListener("pointermove", e => {
      if (!dragging) return;
      const v = valueAt(e.clientX);
      if (v !== scatterCongressIdx) paint(v, 0);
    });
    const endDrag = e => {
      if (!dragging) return;
      dragging = false;
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    function step(delta) {
      const next = Math.max(0, Math.min(maxIdx, scatterCongressIdx + delta));
      if (next !== scatterCongressIdx) paint(next, 300);
    }
    prevBtn.addEventListener("click", e => { e.preventDefault(); step(-1); });
    nextBtn.addEventListener("click", e => { e.preventDefault(); step(+1); });

    let timer = null;
    function stopPlay() {
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = "▶";
    }
    playBtn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      if (timer) { stopPlay(); return; }
      playBtn.textContent = "❚❚";
      timer = setInterval(() => {
        if (scatterCongressIdx >= ctx.data.orderedNums.length - 1) { stopPlay(); return; }
        paint(scatterCongressIdx + 1, 600);
      }, 700);
    });

    // Expose keyboard handlers via context for global listener.
    ctx.timeSliderHandlers = {
      step(delta) {
        const i = Math.max(0, Math.min(ctx.data.orderedNums.length - 1, scatterCongressIdx + delta));
        paint(i, 300);
      }
    };
  }

  function clearScatter() {
    scatter = null;
    scatterCongressIdx = null;
    scatterCurrent = null;
  }

  // -------------------- SCENE 9: scree comparison --------------------
  function renderScree(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    clearScatter();

    const ca = data.byCongress.get(COMPARE_CONGRESS);
    const cb = data.byCongress.get(REFERENCE_CONGRESS);
    setReadout(readout, [
      [`PC1 (${ca.year_start})`, (ca.explained_variance_ratio[0] * 100).toFixed(0) + "%"],
      [`PC2 (${ca.year_start})`, (ca.explained_variance_ratio[1] * 100).toFixed(0) + "%"],
      [`PC1 (${cb.year_start})`, (cb.explained_variance_ratio[0] * 100).toFixed(0) + "%"],
      [`PC2 (${cb.year_start})`, (cb.explained_variance_ratio[1] * 100).toFixed(0) + "%"],
    ]);

    const { w, h } = dims(svg);
    const half = w / 2;
    const margin = { top: 56, right: 24, bottom: 48, left: 48 };

    function drawOne(x0, label, c) {
      const innerW = half - margin.left - margin.right;
      const innerH = h - margin.top - margin.bottom;
      const root = d3.select(svg).append("g").attr("transform", `translate(${x0 + margin.left},${margin.top})`);
      const top = c.explained_variance_ratio.slice(0, 8);

      const x = d3.scaleBand().domain(d3.range(top.length)).range([0, innerW]).padding(0.25);
      const y = d3.scaleLinear().domain([0, Math.max(...top, 0.9)]).range([innerH, 0]);

      root.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickFormat(i => "PC" + (i + 1)));
      root.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

      root.selectAll("rect").data(top).enter().append("rect")
        .attr("class", (d, i) => "scree-bar" + (i === 0 ? " highlight" : ""))
        .attr("x", (d, i) => x(i))
        .attr("y", innerH)
        .attr("width", x.bandwidth())
        .attr("height", 0)
        .transition().delay((d, i) => i * 60).duration(500)
        .attr("y", d => y(d))
        .attr("height", d => innerH - y(d));

      root.selectAll(".pct").data(top).enter().append("text")
        .attr("class", "scree-pct")
        .attr("x", (d, i) => x(i) + x.bandwidth() / 2)
        .attr("y", d => y(d) - 4)
        .attr("text-anchor", "middle")
        .style("opacity", 0)
        .text(d => (d * 100).toFixed(0) + "%")
        .transition().delay(800).duration(300).style("opacity", 1);

      d3.select(svg).append("text").attr("class", "scree-title")
        .attr("x", x0 + half / 2).attr("y", 28)
        .attr("text-anchor", "middle")
        .text(`${label} — ${c.year_start}`);
    }

    drawOne(0, "Civil Rights era", ca);
    drawOne(half, "Today", cb);
  }

  // -------------------- SCENE 10: k-means --------------------
  function renderKmeans(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    clearScatter();

    const c = data.byCongress.get(REFERENCE_CONGRESS);
    setReadout(readout, [
      ["Congress", c.congress],
      ["Algorithm", "k-means, k=2"],
      ["Init", "random"],
      ["ARI vs party", c.kmeans_ari == null ? "—" : c.kmeans_ari.toFixed(2)],
    ]);

    const { w, h } = dims(svg);
    const margin = { top: 24, right: 24, bottom: 48, left: 56 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    const ext = globalExtent(data.congresses);
    const xMag = Math.max(Math.abs(ext.x0), Math.abs(ext.x1)) * 1.05;
    const yMag = Math.max(Math.abs(ext.y0), Math.abs(ext.y1)) * 1.05;
    const x = d3.scaleLinear().domain([-xMag, xMag]).range([0, innerW]);
    const y = d3.scaleLinear().domain([-yMag, yMag]).range([innerH, 0]);
    const root = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    root.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6));
    root.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));

    const points = c.senators.map(s => ({ ...s, _x: s.pc1, _y: s.pc2 }));
    const dots = root.selectAll("circle.dot").data(points).enter().append("circle")
      .attr("class", "dot gray")
      .attr("cx", d => x(d._x)).attr("cy", d => y(d._y))
      .attr("r", 6).style("opacity", 0.8);

    // Random init (within domain).
    const rng = mulberry32(11);
    let cents = [
      { x: (rng() - 0.5) * xMag, y: (rng() - 0.5) * yMag },
      { x: (rng() - 0.5) * xMag, y: (rng() - 0.5) * yMag },
    ];
    const centG = root.append("g");
    function paintCentroids(ms = 400) {
      const sel = centG.selectAll("circle.centroid").data(cents);
      sel.enter().append("circle").attr("class", "centroid").attr("r", 14)
        .merge(sel).transition().duration(ms)
        .attr("cx", d => x(d.x)).attr("cy", d => y(d.y));
    }
    function assign() {
      points.forEach(p => {
        const d0 = (p._x - cents[0].x) ** 2 + (p._y - cents[0].y) ** 2;
        const d1 = (p._x - cents[1].x) ** 2 + (p._y - cents[1].y) ** 2;
        p._k = d0 < d1 ? 0 : 1;
      });
    }
    function recompute() {
      [0, 1].forEach(k => {
        const sub = points.filter(p => p._k === k);
        if (sub.length) {
          cents[k] = { x: d3.mean(sub, p => p._x), y: d3.mean(sub, p => p._y) };
        }
      });
    }
    function colorByCluster(ms = 500) {
      dots.transition().duration(ms)
        .attr("class", d => d._k === 0 ? "dot D" : "dot R");
    }

    paintCentroids(0);

    // Animate Lloyd iterations.
    let step = 0;
    const totalSteps = 6;
    const tick = setInterval(() => {
      assign(); colorByCluster(400);
      setTimeout(() => { recompute(); paintCentroids(500); }, 450);
      step++;
      if (step >= totalSteps) clearInterval(tick);
    }, 1000);
  }

  // -------------------- SCENE 11: boundary inhabitants --------------------
  function renderBoundary(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    clearScatter();

    const c = data.byCongress.get(REFERENCE_CONGRESS);
    const senators = c.senators;

    // Find centroids of each party (D, R) and rank by distance to the boundary
    // (here: smallest |PC1 - midpoint between party means|).
    const ds = senators.filter(s => s.party === "D");
    const rs = senators.filter(s => s.party === "R");
    if (!ds.length || !rs.length) return;
    const dMean = d3.mean(ds, s => s.pc1);
    const rMean = d3.mean(rs, s => s.pc1);
    const mid = (dMean + rMean) / 2;
    const ranked = senators.slice().sort((a, b) => Math.abs(a.pc1 - mid) - Math.abs(b.pc1 - mid));
    const swing = ranked.slice(0, 8).map(s => s.bioguide || s.icpsr);
    const swingSet = new Set(swing);

    setReadout(readout, [
      ["Congress", c.congress],
      ["Distance to boundary", "ranked"],
      ["Highlighted", swing.length],
      ["These are", "the swing senators"],
    ]);

    const { w, h } = dims(svg);
    const margin = { top: 24, right: 24, bottom: 48, left: 56 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    const ext = globalExtent(data.congresses);
    const xMag = Math.max(Math.abs(ext.x0), Math.abs(ext.x1)) * 1.05;
    const yMag = Math.max(Math.abs(ext.y0), Math.abs(ext.y1)) * 1.05;
    const x = d3.scaleLinear().domain([-xMag, xMag]).range([0, innerW]);
    const y = d3.scaleLinear().domain([-yMag, yMag]).range([innerH, 0]);
    const root = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    root.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6));
    root.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));

    root.selectAll("circle").data(senators).enter().append("circle")
      .attr("class", d => {
        const id = d.bioguide || d.icpsr;
        return "dot " + partyClass(d.party) + (swingSet.has(id) ? " misclassified" : "");
      })
      .attr("cx", d => x(d.pc1)).attr("cy", d => y(d.pc2))
      .attr("r", d => swingSet.has(d.bioguide || d.icpsr) ? 9 : 5)
      .style("opacity", d => swingSet.has(d.bioguide || d.icpsr) ? 1 : 0.4);

    root.selectAll("text.label").data(senators.filter(s => swingSet.has(s.bioguide || s.icpsr)))
      .enter().append("text")
      .attr("class", "dot label")
      .attr("x", d => x(d.pc1) + 12)
      .attr("y", d => y(d.pc2) + 4)
      .text(d => {
        const last = d.name.split(",")[0];
        return `${last} (${d.state})`;
      });
  }

  // -------------------- SCENE 12: RF importances --------------------
  function renderImportances(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    clearScatter();

    const c = data.byCongress.get(REFERENCE_CONGRESS);
    const top = c.rf_importances.slice(0, 15);
    const procedural = top.filter(r => /(Cloture|Motion|table|Proceed)/i.test(r.vote_question || r.vote_desc)).length;
    setReadout(readout, [
      ["Congress", c.congress],
      ["Top votes shown", top.length],
      ["Procedural", `${procedural} / ${top.length}`],
      ["Method", "RF feature importance"],
    ]);

    const { w, h } = dims(svg);
    const margin = { top: 24, right: 80, bottom: 24, left: 320 };
    const innerW = w - margin.left - margin.right;
    const innerH = h - margin.top - margin.bottom;
    const root = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand().domain(d3.range(top.length)).range([0, innerH]).padding(0.2);
    const x = d3.scaleLinear().domain([0, d3.max(top, d => d.importance) * 1.1]).range([0, innerW]);

    root.selectAll("rect").data(top).enter().append("rect")
      .attr("class", d => "imp-bar" + (/(Cloture|Motion|table|Proceed)/i.test(d.vote_question || d.vote_desc) ? " procedural" : ""))
      .attr("x", 0)
      .attr("y", (d, i) => y(i))
      .attr("height", y.bandwidth())
      .attr("width", 0)
      .transition().delay((d, i) => i * 40).duration(500).attr("width", d => x(d.importance));

    root.selectAll("text.imp-label").data(top).enter().append("text")
      .attr("class", "imp-label")
      .attr("x", -8)
      .attr("y", (d, i) => y(i) + y.bandwidth() / 2 + 3)
      .attr("text-anchor", "end")
      .text(d => {
        const date = (d.date || "").slice(0, 10);
        const desc = (d.vote_question || d.vote_desc || "").slice(0, 32);
        return `${date}  ${desc}`;
      });

    root.selectAll("text.imp-pct").data(top).enter().append("text")
      .attr("class", "imp-pct")
      .attr("x", d => x(d.importance) + 6)
      .attr("y", (d, i) => y(i) + y.bandwidth() / 2 + 3)
      .style("opacity", 0)
      .text(d => (d.importance * 100).toFixed(1) + "%")
      .transition().delay(700).duration(400).style("opacity", 1);
  }

  // -------------------- SCENE 13: outro --------------------
  function renderOutro(ctx) {
    const { svg, overlay, readout, data } = ctx;
    clear(svg);
    clearOverlay(overlay);
    clearScatter();
    setReadout(readout, [
      ["Senators", "100"],
      ["Years", "175"],
      ["Dimensions", "2"],
    ]);
    // Final: a clean, gray scatter of the most recent Congress.
    const c = data.byCongress.get(REFERENCE_CONGRESS);
    const { w, h } = dims(svg);
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const ext = globalExtent(data.congresses);
    const xMag = Math.max(Math.abs(ext.x0), Math.abs(ext.x1)) * 1.05;
    const yMag = Math.max(Math.abs(ext.y0), Math.abs(ext.y1)) * 1.05;
    const x = d3.scaleLinear().domain([-xMag, xMag]).range([margin.left, w - margin.right]);
    const y = d3.scaleLinear().domain([-yMag, yMag]).range([h - margin.bottom, margin.top]);
    d3.select(svg).selectAll("circle").data(c.senators).enter().append("circle")
      .attr("class", d => "dot " + partyClass(d.party))
      .attr("cx", d => x(d.pc1)).attr("cy", d => y(d.pc2))
      .attr("r", 0).style("opacity", 0.85)
      .transition().delay((d, i) => i * 6).duration(400).attr("r", 7);
  }

  // -------------------- helpers --------------------
  function globalExtent(congresses) {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const c of congresses) for (const s of c.senators) {
      if (s.pc1 < x0) x0 = s.pc1;
      if (s.pc1 > x1) x1 = s.pc1;
      if (s.pc2 < y0) y0 = s.pc2;
      if (s.pc2 > y1) y1 = s.pc2;
    }
    return { x0, x1, y0, y1 };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  // Tiny seedable PRNG.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // -------------------- registry --------------------
  global.SCENES = {
    grid: { enter: renderIntro },
    matrix: { enter: renderMatrix },
    "single-bill": { enter: renderSingleBill },
    "two-bills": { enter: renderTwoBills },
    math: { enter: renderMath },
    scatter: {
      enter(ctx, opts) {
        const sub = opts && opts.sub;
        if (sub === "reveal") renderScatterReveal(ctx);
        else if (sub === "party") renderScatterParty(ctx);
        else if (sub === "time") renderScatterTime(ctx);
        else renderScatterParty(ctx);
      }
    },
    scree: { enter: renderScree },
    kmeans: { enter: renderKmeans },
    boundary: { enter: renderBoundary },
    importances: { enter: renderImportances },
    outro: { enter: renderOutro },
  };

  global._sceneHelpers = { clearScatter };
})(window);
