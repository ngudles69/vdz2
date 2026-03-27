/**
 * StitchLibrary -- Complete CYC stitch definitions registry.
 *
 * Contains ~45 standard crochet stitches organized into 9 categories,
 * each with US/UK terminology, yarn length/height factors, atlas index,
 * and a Canvas 2D draw function for texture atlas generation.
 *
 * Stitch data sits on EDGES (not vertices). Vertices are structural
 * topology; edges carry stitch assignments.
 *
 * @example
 *   const lib = new StitchLibrary();
 *   const sc = lib.get('sc');       // Single Crochet definition
 *   const basics = lib.getCategory('basic');
 *   const palette = lib.getSimplePalette(); // 5 common stitches
 */

// ---------------------------------------------------------------------------
// Category definitions (ordered)
// ---------------------------------------------------------------------------

const STITCH_CATEGORIES = [
  { key: 'basic',             label: 'Basic Stitches' },
  { key: 'extended',          label: 'Extended Stitches' },
  { key: 'increases',         label: 'Increases' },
  { key: 'decreases',         label: 'Decreases' },
  { key: 'frontPost',         label: 'Front Post' },
  { key: 'backPost',          label: 'Back Post' },
  { key: 'shellsAndClusters', label: 'Shells & Clusters' },
  { key: 'joining',           label: 'Joining' },
  { key: 'surface',           label: 'Surface' },
];

// ---------------------------------------------------------------------------
// Symbol draw functions registry
// Each function: (ctx, cx, cy, size) => void
// Draws the stitch symbol centered at (cx, cy) within a bounding box of `size`.
// Caller is responsible for beginPath/stroke/fill.
// ---------------------------------------------------------------------------

const SYMBOL_DRAWS = new Map();

// --- Basic ---

// ch (chain): small oval/circle
SYMBOL_DRAWS.set('ch', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.25, s * 0.15, 0, 0, Math.PI * 2);
  ctx.stroke();
});

// sl_st (slip stitch): small filled dot
SYMBOL_DRAWS.set('sl_st', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
});

// sc (single crochet): X shape
SYMBOL_DRAWS.set('sc', (ctx, cx, cy, s) => {
  const d = s * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.stroke();
});

// hdc (half double crochet): T shape
SYMBOL_DRAWS.set('hdc', (ctx, cx, cy, s) => {
  const h = s * 0.3;
  const w = s * 0.2;
  ctx.beginPath();
  // Vertical stem
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top bar
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  ctx.stroke();
});

// Helper: T with slashes through stem
function drawTWithSlashes(ctx, cx, cy, s, slashCount) {
  const h = s * 0.3;
  const w = s * 0.2;
  const slashW = s * 0.1;
  ctx.beginPath();
  // Vertical stem
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top bar
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  ctx.stroke();
  // Slashes through the stem
  const stemLen = h * 2;
  const spacing = stemLen / (slashCount + 1);
  for (let i = 1; i <= slashCount; i++) {
    const yy = cy + h - spacing * i;
    ctx.beginPath();
    ctx.moveTo(cx - slashW, yy + slashW * 0.5);
    ctx.lineTo(cx + slashW, yy - slashW * 0.5);
    ctx.stroke();
  }
}

// dc (double crochet): T with one slash
SYMBOL_DRAWS.set('dc', (ctx, cx, cy, s) => drawTWithSlashes(ctx, cx, cy, s, 1));

// tr (treble crochet): T with two slashes
SYMBOL_DRAWS.set('tr', (ctx, cx, cy, s) => drawTWithSlashes(ctx, cx, cy, s, 2));

// dtr (double treble): T with three slashes
SYMBOL_DRAWS.set('dtr', (ctx, cx, cy, s) => drawTWithSlashes(ctx, cx, cy, s, 3));

// trtr (triple treble): T with four slashes
SYMBOL_DRAWS.set('trtr', (ctx, cx, cy, s) => drawTWithSlashes(ctx, cx, cy, s, 4));

// --- Extended (taller T, marked with small horizontal tick at base) ---

function drawExtended(ctx, cx, cy, s, baseSlashCount) {
  const h = s * 0.35; // taller than basic
  const w = s * 0.2;
  const slashW = s * 0.1;
  ctx.beginPath();
  // Vertical stem (taller)
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top bar
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  // Base tick (marks extended stitch)
  ctx.moveTo(cx - slashW * 0.6, cy + h);
  ctx.lineTo(cx + slashW * 0.6, cy + h);
  ctx.stroke();
  // Slashes
  const stemLen = h * 2;
  const spacing = stemLen / (baseSlashCount + 2);
  for (let i = 1; i <= baseSlashCount; i++) {
    const yy = cy + h - spacing * (i + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - slashW, yy + slashW * 0.5);
    ctx.lineTo(cx + slashW, yy - slashW * 0.5);
    ctx.stroke();
  }
}

SYMBOL_DRAWS.set('esc', (ctx, cx, cy, s) => drawExtended(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('ehdc', (ctx, cx, cy, s) => drawExtended(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('edc', (ctx, cx, cy, s) => drawExtended(ctx, cx, cy, s, 1));
SYMBOL_DRAWS.set('etr', (ctx, cx, cy, s) => drawExtended(ctx, cx, cy, s, 2));

// --- Increases: V shape (diverging from bottom point) ---

function drawIncrease(ctx, cx, cy, s, _count) {
  const h = s * 0.3;
  const w = s * 0.2;
  ctx.beginPath();
  // V shape: two lines from bottom center going up-left and up-right
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx, cy + h * 0.5);
  ctx.lineTo(cx + w, cy - h);
  ctx.stroke();
}

SYMBOL_DRAWS.set('sc2in1', (ctx, cx, cy, s) => drawIncrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('hdc2in1', (ctx, cx, cy, s) => drawIncrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('dc2in1', (ctx, cx, cy, s) => drawIncrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('tr2in1', (ctx, cx, cy, s) => drawIncrease(ctx, cx, cy, s, 2));

function drawIncrease3(ctx, cx, cy, s) {
  const h = s * 0.3;
  const w = s * 0.25;
  ctx.beginPath();
  // Fan shape: three lines from bottom center
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx, cy + h * 0.5);
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx, cy + h * 0.5);
  ctx.moveTo(cx + w, cy - h);
  ctx.lineTo(cx, cy + h * 0.5);
  ctx.stroke();
}

SYMBOL_DRAWS.set('sc3in1', (ctx, cx, cy, s) => drawIncrease3(ctx, cx, cy, s));
SYMBOL_DRAWS.set('dc3in1', (ctx, cx, cy, s) => drawIncrease3(ctx, cx, cy, s));

// --- Decreases: inverted V (converging to top point) ---

function drawDecrease(ctx, cx, cy, s, _count) {
  const h = s * 0.3;
  const w = s * 0.2;
  ctx.beginPath();
  // Inverted V: two lines from top center going down-left and down-right
  ctx.moveTo(cx - w, cy + h);
  ctx.lineTo(cx, cy - h * 0.5);
  ctx.lineTo(cx + w, cy + h);
  ctx.stroke();
}

SYMBOL_DRAWS.set('sc2tog', (ctx, cx, cy, s) => drawDecrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('hdc2tog', (ctx, cx, cy, s) => drawDecrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('dc2tog', (ctx, cx, cy, s) => drawDecrease(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('tr2tog', (ctx, cx, cy, s) => drawDecrease(ctx, cx, cy, s, 2));

function drawDecrease3(ctx, cx, cy, s) {
  const h = s * 0.3;
  const w = s * 0.25;
  ctx.beginPath();
  // Inverted fan: three lines converging to top center
  ctx.moveTo(cx - w, cy + h);
  ctx.lineTo(cx, cy - h * 0.5);
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h * 0.5);
  ctx.moveTo(cx + w, cy + h);
  ctx.lineTo(cx, cy - h * 0.5);
  ctx.stroke();
}

SYMBOL_DRAWS.set('sc3tog', (ctx, cx, cy, s) => drawDecrease3(ctx, cx, cy, s));
SYMBOL_DRAWS.set('dc3tog', (ctx, cx, cy, s) => drawDecrease3(ctx, cx, cy, s));

// --- Front Post: circle around base of T ---

function drawFrontPost(ctx, cx, cy, s, slashCount) {
  const h = s * 0.28;
  const w = s * 0.18;
  const slashW = s * 0.08;
  ctx.beginPath();
  // Vertical stem
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top bar
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  ctx.stroke();
  // Circle at base (front post indicator)
  ctx.beginPath();
  ctx.arc(cx, cy + h, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  // Slashes
  if (slashCount > 0) {
    const stemLen = h * 2;
    const spacing = stemLen / (slashCount + 1);
    for (let i = 1; i <= slashCount; i++) {
      const yy = cy + h - spacing * i;
      ctx.beginPath();
      ctx.moveTo(cx - slashW, yy + slashW * 0.5);
      ctx.lineTo(cx + slashW, yy - slashW * 0.5);
      ctx.stroke();
    }
  }
}

SYMBOL_DRAWS.set('FPsc', (ctx, cx, cy, s) => drawFrontPost(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('FPhdc', (ctx, cx, cy, s) => drawFrontPost(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('FPdc', (ctx, cx, cy, s) => drawFrontPost(ctx, cx, cy, s, 1));
SYMBOL_DRAWS.set('FPtr', (ctx, cx, cy, s) => drawFrontPost(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('FPdtr', (ctx, cx, cy, s) => drawFrontPost(ctx, cx, cy, s, 3));

// --- Back Post: circle around base of T, dashed ---

function drawBackPost(ctx, cx, cy, s, slashCount) {
  const h = s * 0.28;
  const w = s * 0.18;
  const slashW = s * 0.08;
  ctx.beginPath();
  // Vertical stem
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top bar
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w, cy - h);
  ctx.stroke();
  // Dashed circle at base (back post indicator)
  ctx.save();
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(cx, cy + h, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Slashes
  if (slashCount > 0) {
    const stemLen = h * 2;
    const spacing = stemLen / (slashCount + 1);
    for (let i = 1; i <= slashCount; i++) {
      const yy = cy + h - spacing * i;
      ctx.beginPath();
      ctx.moveTo(cx - slashW, yy + slashW * 0.5);
      ctx.lineTo(cx + slashW, yy - slashW * 0.5);
      ctx.stroke();
    }
  }
}

SYMBOL_DRAWS.set('BPsc', (ctx, cx, cy, s) => drawBackPost(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('BPhdc', (ctx, cx, cy, s) => drawBackPost(ctx, cx, cy, s, 0));
SYMBOL_DRAWS.set('BPdc', (ctx, cx, cy, s) => drawBackPost(ctx, cx, cy, s, 1));
SYMBOL_DRAWS.set('BPtr', (ctx, cx, cy, s) => drawBackPost(ctx, cx, cy, s, 2));
SYMBOL_DRAWS.set('BPdtr', (ctx, cx, cy, s) => drawBackPost(ctx, cx, cy, s, 3));

// --- Shells & Clusters ---

// sh (shell): fan shape
SYMBOL_DRAWS.set('sh', (ctx, cx, cy, s) => {
  const h = s * 0.28;
  const w = s * 0.3;
  ctx.beginPath();
  // Fan: 5 lines radiating from bottom center
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI * 0.7 + (Math.PI * 0.4 / 4) * i;
    ctx.moveTo(cx, cy + h * 0.5);
    ctx.lineTo(cx + Math.cos(angle) * w, cy + h * 0.5 + Math.sin(angle) * h * 1.5);
  }
  ctx.stroke();
});

// CL (cluster): inverted fan converging to top
SYMBOL_DRAWS.set('CL', (ctx, cx, cy, s) => {
  const h = s * 0.28;
  const w = s * 0.2;
  ctx.beginPath();
  // Three lines converging to top center
  ctx.moveTo(cx - w, cy + h);
  ctx.lineTo(cx, cy - h);
  ctx.moveTo(cx, cy + h);
  ctx.lineTo(cx, cy - h);
  ctx.moveTo(cx + w, cy + h);
  ctx.lineTo(cx, cy - h);
  // Top cap
  ctx.moveTo(cx - s * 0.06, cy - h);
  ctx.lineTo(cx + s * 0.06, cy - h);
  ctx.stroke();
});

// pc (popcorn): puffed oval
SYMBOL_DRAWS.set('pc', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.15, s * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Small horizontal line at top
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, cy - s * 0.22);
  ctx.lineTo(cx + s * 0.08, cy - s * 0.22);
  ctx.stroke();
});

// bo (bobble): filled oval
SYMBOL_DRAWS.set('bo', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.13, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
});

// ps (puff stitch): open oval with horizontal lines
SYMBOL_DRAWS.set('ps', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.15, s * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
});

// --- Joining ---

// sl_st_join: small filled square
SYMBOL_DRAWS.set('sl_st_join', (ctx, cx, cy, s) => {
  const d = s * 0.1;
  ctx.fillRect(cx - d, cy - d, d * 2, d * 2);
});

// ch_sp (chain space): small open circle
SYMBOL_DRAWS.set('ch_sp', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2);
  ctx.stroke();
});

// --- Surface ---

// FL (front loop): small loop arc at top
SYMBOL_DRAWS.set('FL', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, Math.PI, 0);
  ctx.stroke();
  // Small tick below
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + s * 0.15);
  ctx.stroke();
});

// BL (back loop): small loop arc at bottom
SYMBOL_DRAWS.set('BL', (ctx, cx, cy, s) => {
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, 0, Math.PI);
  ctx.stroke();
  // Small tick above
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - s * 0.15);
  ctx.stroke();
});

// picot: small triangle
SYMBOL_DRAWS.set('picot', (ctx, cx, cy, s) => {
  const d = s * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.lineTo(cx + d, cy + d);
  ctx.closePath();
  ctx.stroke();
});

// ---------------------------------------------------------------------------
// Stitch definitions data
// ---------------------------------------------------------------------------

/**
 * Build the complete stitch definitions array.
 * @returns {Array<Object>} Array of stitch definition objects
 */
function buildStitchDefs() {
  let idx = 0;

  const defs = [
    // === Basic (8) ===
    { id: 'ch',    nameUS: 'Chain',            nameUK: 'Chain',            abbrUS: 'ch',    abbrUK: 'ch',    category: 'basic', yarnLengthFactor: 0.5, heightFactor: 0.3, atlasIndex: idx++ },
    { id: 'sl_st', nameUS: 'Slip Stitch',      nameUK: 'Slip Stitch',     abbrUS: 'sl st',  abbrUK: 'ss',    category: 'basic', yarnLengthFactor: 0.3, heightFactor: 0.2, atlasIndex: idx++ },
    { id: 'sc',    nameUS: 'Single Crochet',   nameUK: 'Double Crochet',  abbrUS: 'sc',    abbrUK: 'dc',    category: 'basic', yarnLengthFactor: 1.0, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'hdc',   nameUS: 'Half Double Crochet', nameUK: 'Half Treble Crochet', abbrUS: 'hdc', abbrUK: 'htr', category: 'basic', yarnLengthFactor: 1.5, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'dc',    nameUS: 'Double Crochet',   nameUK: 'Treble Crochet',  abbrUS: 'dc',    abbrUK: 'tr',    category: 'basic', yarnLengthFactor: 2.0, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'tr',    nameUS: 'Treble Crochet',   nameUK: 'Double Treble Crochet', abbrUS: 'tr', abbrUK: 'dtr', category: 'basic', yarnLengthFactor: 2.5, heightFactor: 3.0, atlasIndex: idx++ },
    { id: 'dtr',   nameUS: 'Double Treble Crochet', nameUK: 'Triple Treble Crochet', abbrUS: 'dtr', abbrUK: 'trtr', category: 'basic', yarnLengthFactor: 3.0, heightFactor: 4.0, atlasIndex: idx++ },
    { id: 'trtr',  nameUS: 'Triple Treble Crochet', nameUK: 'Quadruple Treble Crochet', abbrUS: 'trtr', abbrUK: 'qtr', category: 'basic', yarnLengthFactor: 3.5, heightFactor: 5.0, atlasIndex: idx++ },

    // === Extended (4) ===
    { id: 'esc',   nameUS: 'Extended Single Crochet',     nameUK: 'Extended Double Crochet',      abbrUS: 'esc',   abbrUK: 'edc',   category: 'extended', yarnLengthFactor: 1.2, heightFactor: 1.3, atlasIndex: idx++ },
    { id: 'ehdc',  nameUS: 'Extended Half Double Crochet', nameUK: 'Extended Half Treble Crochet', abbrUS: 'ehdc',  abbrUK: 'ehtr',  category: 'extended', yarnLengthFactor: 1.8, heightFactor: 1.8, atlasIndex: idx++ },
    { id: 'edc',   nameUS: 'Extended Double Crochet',     nameUK: 'Extended Treble Crochet',      abbrUS: 'edc',   abbrUK: 'etr',   category: 'extended', yarnLengthFactor: 2.4, heightFactor: 2.5, atlasIndex: idx++ },
    { id: 'etr',   nameUS: 'Extended Treble Crochet',     nameUK: 'Extended Double Treble Crochet', abbrUS: 'etr', abbrUK: 'edtr',  category: 'extended', yarnLengthFactor: 3.0, heightFactor: 3.5, atlasIndex: idx++ },

    // === Increases (6) ===
    { id: 'sc2in1',  nameUS: '2 SC in 1',   nameUK: '2 DC in 1',   abbrUS: '2sc',   abbrUK: '2dc',   category: 'increases', yarnLengthFactor: 2.0, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'hdc2in1', nameUS: '2 HDC in 1',  nameUK: '2 HTR in 1',  abbrUS: '2hdc',  abbrUK: '2htr',  category: 'increases', yarnLengthFactor: 3.0, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'dc2in1',  nameUS: '2 DC in 1',   nameUK: '2 TR in 1',   abbrUS: '2dc',   abbrUK: '2tr',   category: 'increases', yarnLengthFactor: 4.0, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'tr2in1',  nameUS: '2 TR in 1',   nameUK: '2 DTR in 1',  abbrUS: '2tr',   abbrUK: '2dtr',  category: 'increases', yarnLengthFactor: 5.0, heightFactor: 3.0, atlasIndex: idx++ },
    { id: 'sc3in1',  nameUS: '3 SC in 1',   nameUK: '3 DC in 1',   abbrUS: '3sc',   abbrUK: '3dc',   category: 'increases', yarnLengthFactor: 3.0, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'dc3in1',  nameUS: '3 DC in 1',   nameUK: '3 TR in 1',   abbrUS: '3dc',   abbrUK: '3tr',   category: 'increases', yarnLengthFactor: 6.0, heightFactor: 2.0, atlasIndex: idx++ },

    // === Decreases (6) ===
    { id: 'sc2tog',  nameUS: 'SC2tog',  nameUK: 'DC2tog',  abbrUS: 'sc2tog',  abbrUK: 'dc2tog',  category: 'decreases', yarnLengthFactor: 0.8, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'hdc2tog', nameUS: 'HDC2tog', nameUK: 'HTR2tog', abbrUS: 'hdc2tog', abbrUK: 'htr2tog', category: 'decreases', yarnLengthFactor: 1.2, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'dc2tog',  nameUS: 'DC2tog',  nameUK: 'TR2tog',  abbrUS: 'dc2tog',  abbrUK: 'tr2tog',  category: 'decreases', yarnLengthFactor: 1.6, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'tr2tog',  nameUS: 'TR2tog',  nameUK: 'DTR2tog', abbrUS: 'tr2tog',  abbrUK: 'dtr2tog', category: 'decreases', yarnLengthFactor: 2.0, heightFactor: 3.0, atlasIndex: idx++ },
    { id: 'sc3tog',  nameUS: 'SC3tog',  nameUK: 'DC3tog',  abbrUS: 'sc3tog',  abbrUK: 'dc3tog',  category: 'decreases', yarnLengthFactor: 0.8, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'dc3tog',  nameUS: 'DC3tog',  nameUK: 'TR3tog',  abbrUS: 'dc3tog',  abbrUK: 'tr3tog',  category: 'decreases', yarnLengthFactor: 1.6, heightFactor: 2.0, atlasIndex: idx++ },

    // === Front Post (5) ===
    { id: 'FPsc',  nameUS: 'Front Post SC',  nameUK: 'Front Post DC',  abbrUS: 'FPsc',  abbrUK: 'FPdc',  category: 'frontPost', yarnLengthFactor: 1.3, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'FPhdc', nameUS: 'Front Post HDC', nameUK: 'Front Post HTR', abbrUS: 'FPhdc', abbrUK: 'FPhtr', category: 'frontPost', yarnLengthFactor: 1.95, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'FPdc',  nameUS: 'Front Post DC',  nameUK: 'Front Post TR',  abbrUS: 'FPdc',  abbrUK: 'FPtr',  category: 'frontPost', yarnLengthFactor: 2.6, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'FPtr',  nameUS: 'Front Post TR',  nameUK: 'Front Post DTR', abbrUS: 'FPtr',  abbrUK: 'FPdtr', category: 'frontPost', yarnLengthFactor: 3.25, heightFactor: 3.0, atlasIndex: idx++ },
    { id: 'FPdtr', nameUS: 'Front Post DTR', nameUK: 'Front Post TTR', abbrUS: 'FPdtr', abbrUK: 'FPttr', category: 'frontPost', yarnLengthFactor: 3.9, heightFactor: 4.0, atlasIndex: idx++ },

    // === Back Post (5) ===
    { id: 'BPsc',  nameUS: 'Back Post SC',  nameUK: 'Back Post DC',  abbrUS: 'BPsc',  abbrUK: 'BPdc',  category: 'backPost', yarnLengthFactor: 1.3, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'BPhdc', nameUS: 'Back Post HDC', nameUK: 'Back Post HTR', abbrUS: 'BPhdc', abbrUK: 'BPhtr', category: 'backPost', yarnLengthFactor: 1.95, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'BPdc',  nameUS: 'Back Post DC',  nameUK: 'Back Post TR',  abbrUS: 'BPdc',  abbrUK: 'BPtr',  category: 'backPost', yarnLengthFactor: 2.6, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'BPtr',  nameUS: 'Back Post TR',  nameUK: 'Back Post DTR', abbrUS: 'BPtr',  abbrUK: 'BPdtr', category: 'backPost', yarnLengthFactor: 3.25, heightFactor: 3.0, atlasIndex: idx++ },
    { id: 'BPdtr', nameUS: 'Back Post DTR', nameUK: 'Back Post TTR', abbrUS: 'BPdtr', abbrUK: 'BPttr', category: 'backPost', yarnLengthFactor: 3.9, heightFactor: 4.0, atlasIndex: idx++ },

    // === Shells & Clusters (5) ===
    { id: 'sh',  nameUS: 'Shell',    nameUK: 'Shell',    abbrUS: 'sh',  abbrUK: 'sh',  category: 'shellsAndClusters', yarnLengthFactor: 8.0, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'CL',  nameUS: 'Cluster',  nameUK: 'Cluster',  abbrUS: 'CL',  abbrUK: 'CL',  category: 'shellsAndClusters', yarnLengthFactor: 6.0, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'pc',  nameUS: 'Popcorn',  nameUK: 'Popcorn',  abbrUS: 'pc',  abbrUK: 'pc',  category: 'shellsAndClusters', yarnLengthFactor: 5.0, heightFactor: 2.0, atlasIndex: idx++ },
    { id: 'bo',  nameUS: 'Bobble',   nameUK: 'Bobble',   abbrUS: 'bo',  abbrUK: 'bo',  category: 'shellsAndClusters', yarnLengthFactor: 4.5, heightFactor: 1.5, atlasIndex: idx++ },
    { id: 'ps',  nameUS: 'Puff Stitch', nameUK: 'Puff Stitch', abbrUS: 'ps', abbrUK: 'ps', category: 'shellsAndClusters', yarnLengthFactor: 3.5, heightFactor: 1.5, atlasIndex: idx++ },

    // === Joining (2) ===
    { id: 'sl_st_join', nameUS: 'Slip Stitch Join', nameUK: 'Slip Stitch Join', abbrUS: 'sl st join', abbrUK: 'ss join', category: 'joining', yarnLengthFactor: 0.3, heightFactor: 0.2, atlasIndex: idx++ },
    { id: 'ch_sp',      nameUS: 'Chain Space',       nameUK: 'Chain Space',       abbrUS: 'ch-sp',      abbrUK: 'ch-sp',   category: 'joining', yarnLengthFactor: 0.5, heightFactor: 0.3, atlasIndex: idx++ },

    // === Surface (3) ===
    { id: 'FL',    nameUS: 'Front Loop Only', nameUK: 'Front Loop Only', abbrUS: 'FLO', abbrUK: 'FLO', category: 'surface', yarnLengthFactor: 1.0, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'BL',    nameUS: 'Back Loop Only',  nameUK: 'Back Loop Only',  abbrUS: 'BLO', abbrUK: 'BLO', category: 'surface', yarnLengthFactor: 1.0, heightFactor: 1.0, atlasIndex: idx++ },
    { id: 'picot', nameUS: 'Picot',           nameUK: 'Picot',           abbrUS: 'picot', abbrUK: 'picot', category: 'surface', yarnLengthFactor: 1.5, heightFactor: 0.5, atlasIndex: idx++ },
  ];

  // Attach symbol draw function reference to each definition
  for (const def of defs) {
    def.draw = SYMBOL_DRAWS.get(def.id) || null;
  }

  return defs;
}

// ---------------------------------------------------------------------------
// Simple palette (first 5 basic stitches)
// ---------------------------------------------------------------------------

const SIMPLE_PALETTE_IDS = ['ch', 'sc', 'hdc', 'dc', 'tr'];

// ---------------------------------------------------------------------------
// StitchLibrary class
// ---------------------------------------------------------------------------

class StitchLibrary {

  /** @type {Map<string, Object>} Stitch ID -> definition */
  #stitchMap = new Map();

  /** @type {Array<Object>} All definitions in atlas order */
  #allDefs;

  constructor() {
    this.#allDefs = buildStitchDefs();
    for (const def of this.#allDefs) {
      this.#stitchMap.set(def.id, def);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get a stitch definition by ID.
   * @param {string} id - Stitch ID (e.g. 'sc', 'dc', 'FPdc')
   * @returns {Object|null} Stitch definition or null if not found
   */
  get(id) {
    return this.#stitchMap.get(id) || null;
  }

  /**
   * Check if a stitch ID exists.
   * @param {string} id - Stitch ID
   * @returns {boolean}
   */
  has(id) {
    return this.#stitchMap.has(id);
  }

  /**
   * Get all stitch definitions (in atlas index order).
   * @returns {Array<Object>}
   */
  getAll() {
    return [...this.#allDefs];
  }

  /**
   * Get all stitches in a specific category.
   * @param {string} categoryKey - Category key (e.g. 'basic', 'increases')
   * @returns {{ label: string, stitches: Array<Object> }} Category with label and stitch definitions
   */
  getCategory(categoryKey) {
    const catDef = STITCH_CATEGORIES.find(c => c.key === categoryKey);
    if (!catDef) return { label: categoryKey, stitches: [] };

    const stitches = this.#allDefs.filter(d => d.category === categoryKey);
    return { label: catDef.label, stitches };
  }

  /**
   * Get all categories with their stitches.
   * @returns {Array<{ key: string, label: string, stitches: Array<Object> }>}
   */
  getCategories() {
    return STITCH_CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      stitches: this.#allDefs.filter(d => d.category === cat.key),
    }));
  }

  /**
   * Get the simple mode palette (5 most common stitches).
   * @returns {Array<Object>} Array of 5 stitch definitions
   */
  getSimplePalette() {
    return SIMPLE_PALETTE_IDS.map(id => this.#stitchMap.get(id)).filter(Boolean);
  }
}

export { StitchLibrary, STITCH_CATEGORIES };
