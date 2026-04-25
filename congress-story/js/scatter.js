// PCA scatter for one Congress, with smooth transitions between Congresses.
// Uses bioguide ID (or icpsr fallback) as the data join key so senators
// who serve multiple Congresses tween their position rather than reshuffling.

(function (global) {
  const PARTY_ORDER = ["D", "R", "I", "W", "F", "Other"];
  const MARGIN = { top: 24, right: 24, bottom: 48, left: 56 };

  function senatorKey(s) {
    return s.bioguide || `icpsr-${s.icpsr}`;
  }

  function partyClass(p) {
    return PARTY_ORDER.includes(p) ? p : "Other";
  }

  function createScatter(svgEl, options) {
    const svg = d3.select(svgEl);
    const tip = options.onHover || (() => {});
    const onLeave = options.onLeave || (() => {});

    let width = svgEl.clientWidth;
    let height = svgEl.clientHeight;
    let inner = { w: width - MARGIN.left - MARGIN.right, h: height - MARGIN.top - MARGIN.bottom };

    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // Zero lines (drawn first so dots overlay them).
    const zeroX = root.append("line").attr("class", "zero-line");
    const zeroY = root.append("line").attr("class", "zero-line");

    const xAxisG = root.append("g").attr("class", "axis axis-x");
    const yAxisG = root.append("g").attr("class", "axis axis-y");

    root.append("text").attr("class", "axis-label")
      .attr("text-anchor", "middle")
      .attr("x", inner.w / 2)
      .attr("y", inner.h + 36)
      .text("PC1");

    root.append("text").attr("class", "axis-label")
      .attr("text-anchor", "middle")
      .attr("transform", `translate(-40,${inner.h / 2}) rotate(-90)`)
      .text("PC2");

    const dotsG = root.append("g").attr("class", "dots");

    // Global scales — fitted across all Congresses for a fixed frame of reference.
    const x = d3.scaleLinear().range([0, inner.w]);
    const y = d3.scaleLinear().range([inner.h, 0]);

    const xAxis = d3.axisBottom(x).ticks(6).tickSize(-inner.h);
    const yAxis = d3.axisLeft(y).ticks(6).tickSize(-inner.w);

    function setDomains(extent) {
      // Symmetric domain for cleaner visual centering.
      const xMag = Math.max(Math.abs(extent.x0), Math.abs(extent.x1)) * 1.05;
      const yMag = Math.max(Math.abs(extent.y0), Math.abs(extent.y1)) * 1.05;
      x.domain([-xMag, xMag]);
      y.domain([-yMag, yMag]);
      xAxisG.attr("transform", `translate(0,${inner.h})`).call(xAxis);
      yAxisG.call(yAxis);
      zeroX.attr("x1", 0).attr("x2", inner.w).attr("y1", y(0)).attr("y2", y(0));
      zeroY.attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", inner.h);
    }

    function update(senators, transitionMs = 600, opts = {}) {
      const gray = !!opts.gray;
      const cls = d => "dot " + (gray ? "gray" : partyClass(d.party));

      const sel = dotsG.selectAll("circle.dot")
        .data(senators, senatorKey);

      sel.exit()
        .transition().duration(transitionMs / 2)
        .attr("r", 0)
        .style("opacity", 0)
        .remove();

      const enter = sel.enter().append("circle")
        .attr("class", cls)
        .attr("r", 0)
        .attr("cx", d => x(d.pc1))
        .attr("cy", d => y(d.pc2))
        .style("opacity", 0)
        .on("mouseover", function (event, d) { tip(d, this); })
        .on("mouseout", function (event, d) { onLeave(d, this); });

      enter.transition().duration(transitionMs)
        .attr("r", 6)
        .style("opacity", 0.85);

      sel.transition().duration(transitionMs)
        .attr("class", cls)
        .attr("cx", d => x(d.pc1))
        .attr("cy", d => y(d.pc2))
        .attr("r", 6)
        .style("opacity", 0.85);
    }

    return { setDomains, update };
  }

  global.createScatter = createScatter;
  global.senatorKey = senatorKey;
})(window);
