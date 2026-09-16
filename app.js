// =====================================================
// METRONOM
// =====================================================

let bpm = 120;

const bpmVisning = document.getElementById("bpm");
const minusKnapp = document.getElementById("minus");
const plussKnapp = document.getElementById("pluss");
const startKnapp = document.getElementById("start");

let metronomTimer = null;
let audioContext = null;
let spelar = false;
let haldeTimeout = null;
let haldeInterval = null;

function klikk() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.frequency.value = 1000;

  gain.gain.setValueAtTime(0.5, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.05
  );

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.05);
}

function startMetronom() {
  clearInterval(metronomTimer);
  metronomTimer = setInterval(klikk, 60000 / bpm);
}

function endreBpm(endring) {
  bpm += endring;

  if (bpm < 30) bpm = 30;
  if (bpm > 300) bpm = 300;

  bpmVisning.textContent = bpm;

  if (spelar) {
    startMetronom();
  }
}

function startHald(endring) {
  endreBpm(endring);

  haldeTimeout = setTimeout(function () {
    haldeInterval = setInterval(function () {
      endreBpm(endring);
    }, 70);
  }, 400);
}

function stoppHald() {
  clearTimeout(haldeTimeout);
  clearInterval(haldeInterval);

  haldeTimeout = null;
  haldeInterval = null;
}

plussKnapp.addEventListener("pointerdown", function () {
  startHald(1);
});

minusKnapp.addEventListener("pointerdown", function () {
  startHald(-1);
});

[
  "pointerup",
  "pointerleave",
  "pointercancel"
].forEach(function (event) {
  plussKnapp.addEventListener(event, stoppHald);
  minusKnapp.addEventListener(event, stoppHald);
});

startKnapp.addEventListener("click", function () {
  if (spelar) {
    clearInterval(metronomTimer);

    metronomTimer = null;
    spelar = false;

    startKnapp.textContent = "Start";
  } else {
    klikk();
    startMetronom();

    spelar = true;

    startKnapp.textContent = "Stopp";
  }
});


// =====================================================
// TUNER
// =====================================================

const startTunerKnapp =
  document.getElementById("startTuner");

const toneVisning =
  document.getElementById("tone");

const centVisning =
  document.getElementById("cent");

const retningVisning =
  document.getElementById("retning");

const tunerDisplay =
  document.getElementById("tunerDisplay");

const knapp440 =
  document.getElementById("a440");

const knapp442 =
  document.getElementById("a442");


let kammertone = 440;

let tunerContext = null;
let analyser = null;
let mikrofon = null;
let mikrofonStream = null;

let tunerAktiv = false;
let animationFrame = null;

const MIN_SIGNAL = 0.002;
const MIN_FREKVENS = 45;
const MAX_FREKVENS = 2000;

const HISTORIKK_LENGDE = 9;
const UTJAMNING = 0.22;

let frekvensHistorikk = [];
let glattFrekvens = null;


knapp440.addEventListener("click", function () {
  kammertone = 440;

  knapp440.classList.add("aktiv");
  knapp442.classList.remove("aktiv");

  frekvensHistorikk = [];
  glattFrekvens = null;
});


knapp442.addEventListener("click", function () {
  kammertone = 442;

  knapp442.classList.add("aktiv");
  knapp440.classList.remove("aktiv");

  frekvensHistorikk = [];
  glattFrekvens = null;
});


const tunerTonenamn = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B"
];


function frekvensTilMidi(frekvens) {
  return 69 + 12 * Math.log2(frekvens / kammertone);
}


function analyserTone(frekvens) {
  const midiFlyt = frekvensTilMidi(frekvens);
  const midi = Math.round(midiFlyt);

  const cent = (midiFlyt - midi) * 100;

  const toneIndex =
    ((midi % 12) + 12) % 12;

  const oktav =
    Math.floor(midi / 12) - 1;

  return {
    namn: tunerTonenamn[toneIndex],
    oktav: oktav,
    cent: cent
  };
}


function median(verdiar) {
  const sortert =
    [...verdiar].sort(function (a, b) {
      return a - b;
    });

  const midten =
    Math.floor(sortert.length / 2);

  if (sortert.length % 2 === 0) {
    return (
      sortert[midten - 1] +
      sortert[midten]
    ) / 2;
  }

  return sortert[midten];
}


function finnFrekvens(buffer, sampleRate) {
  const lengde = buffer.length;

  let rms = 0;
  let gjennomsnitt = 0;

  for (let i = 0; i < lengde; i++) {
    gjennomsnitt += buffer[i];
  }

  gjennomsnitt /= lengde;

  const signal =
    new Float32Array(lengde);

  for (let i = 0; i < lengde; i++) {
    signal[i] =
      buffer[i] - gjennomsnitt;

    rms +=
      signal[i] * signal[i];
  }

  rms =
    Math.sqrt(rms / lengde);

  if (rms < MIN_SIGNAL) {
    return -1;
  }

  const minsteLag =
    Math.floor(
      sampleRate / MAX_FREKVENS
    );

  const storsteLag =
    Math.min(
      Math.floor(
        sampleRate / MIN_FREKVENS
      ),
      lengde - 2
    );

  const korrelasjonar =
    new Float32Array(
      storsteLag + 1
    );

  for (
    let lag = minsteLag;
    lag <= storsteLag;
    lag++
  ) {
    let sum = 0;
    let energiA = 0;
    let energiB = 0;

    const slutt =
      lengde - lag;

    for (
      let i = 0;
      i < slutt;
      i++
    ) {
      const a = signal[i];
      const b = signal[i + lag];

      sum += a * b;

      energiA += a * a;
      energiB += b * b;
    }

    const divisor =
      Math.sqrt(
        energiA * energiB
      );

    if (divisor > 0) {
      korrelasjonar[lag] =
        sum / divisor;
    }
  }

  const TOPP_TERSKEL = 0.75;

  let besteLag = -1;
  let besteKorrelasjon = 0;

  for (
    let lag = minsteLag + 1;
    lag < storsteLag;
    lag++
  ) {
    const verdi =
      korrelasjonar[lag];

    const lokalTopp =
      verdi >
        korrelasjonar[lag - 1] &&
      verdi >=
        korrelasjonar[lag + 1];

    if (
      lokalTopp &&
      verdi > TOPP_TERSKEL
    ) {
      besteLag = lag;
      besteKorrelasjon = verdi;
      break;
    }
  }

  if (besteLag === -1) {
    for (
      let lag = minsteLag;
      lag <= storsteLag;
      lag++
    ) {
      if (
        korrelasjonar[lag] >
        besteKorrelasjon
      ) {
        besteKorrelasjon =
          korrelasjonar[lag];

        besteLag = lag;
      }
    }
  }

  if (
    besteLag === -1 ||
    besteKorrelasjon < 0.55
  ) {
    return -1;
  }

  let presisLag = besteLag;

  if (
    besteLag > minsteLag &&
    besteLag < storsteLag
  ) {
    const venstre =
      korrelasjonar[
        besteLag - 1
      ];

    const midten =
      korrelasjonar[
        besteLag
      ];

    const hogre =
      korrelasjonar[
        besteLag + 1
      ];

    const divisor =
      venstre -
      2 * midten +
      hogre;

    if (
      Math.abs(divisor) >
      0.000001
    ) {
      const justering =
        0.5 *
        (venstre - hogre) /
        divisor;

      if (
        Math.abs(justering) <= 1
      ) {
        presisLag += justering;
      }
    }
  }

  const frekvens =
    sampleRate / presisLag;

  if (
    frekvens < MIN_FREKVENS ||
    frekvens > MAX_FREKVENS
  ) {
    return -1;
  }

  return frekvens;
}


function stabiliserFrekvens(frekvens) {
  if (
    frekvensHistorikk.length > 0
  ) {
    const tidlegare =
      median(frekvensHistorikk);

    const forhold =
      frekvens / tidlegare;

    if (
      forhold > 1.9 &&
      forhold < 2.1
    ) {
      frekvens /= 2;
    }

    if (
      forhold > 0.48 &&
      forhold < 0.52
    ) {
      frekvens *= 2;
    }
  }

  frekvensHistorikk.push(frekvens);

  if (
    frekvensHistorikk.length >
    HISTORIKK_LENGDE
  ) {
    frekvensHistorikk.shift();
  }

  const medianFrekvens =
    median(frekvensHistorikk);

  if (glattFrekvens === null) {
    glattFrekvens =
      medianFrekvens;

    return glattFrekvens;
  }

  const centForskjell =
    1200 *
    Math.log2(
      medianFrekvens /
      glattFrekvens
    );

  if (
    Math.abs(centForskjell) > 80
  ) {
    glattFrekvens =
      medianFrekvens;
  } else {
    glattFrekvens =
      glattFrekvens +
      (
        medianFrekvens -
        glattFrekvens
      ) *
      UTJAMNING;
  }

  return glattFrekvens;
}


function visTone(frekvens) {
  const tone =
    analyserTone(frekvens);

  const cent =
    Math.round(tone.cent);

  toneVisning.textContent =
    tone.namn + tone.oktav;

  centVisning.textContent =
    cent > 0
      ? "+" + cent + " cent"
      : cent + " cent";

  tunerDisplay.classList.remove(
    "riktig",
    "feil"
  );

  if (
    Math.abs(tone.cent) <= 2
  ) {
    tunerDisplay.classList.add(
      "riktig"
    );

    retningVisning.textContent =
      "✓ Stemt";

  } else if (
    tone.cent < -2
  ) {
    tunerDisplay.classList.add(
      "feil"
    );

    retningVisning.textContent =
      "← For låg";

  } else {
    tunerDisplay.classList.add(
      "feil"
    );

    retningVisning.textContent =
      "For høg →";
  }
}


function oppdaterTuner() {
  if (!tunerAktiv) {
    return;
  }

  const buffer =
    new Float32Array(
      analyser.fftSize
    );

  analyser.getFloatTimeDomainData(
    buffer
  );

  const frekvens =
    finnFrekvens(
      buffer,
      tunerContext.sampleRate
    );

  if (frekvens > 0) {
    const stabilFrekvens =
      stabiliserFrekvens(
        frekvens
      );

    visTone(stabilFrekvens);
  }

  animationFrame =
    requestAnimationFrame(
      oppdaterTuner
    );
}


async function startTuner() {
  try {
    mikrofonStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
          }
        });

    tunerContext =
      new AudioContext();

    if (
      tunerContext.state ===
      "suspended"
    ) {
      await tunerContext.resume();
    }

    analyser =
      tunerContext.createAnalyser();

    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;

    mikrofon =
      tunerContext
        .createMediaStreamSource(
          mikrofonStream
        );

    mikrofon.connect(analyser);

    frekvensHistorikk = [];
    glattFrekvens = null;

    tunerAktiv = true;

    startTunerKnapp.textContent =
      "Stopp tuner";

    retningVisning.textContent =
      "Lyttar…";

    oppdaterTuner();

  } catch (feil) {
    console.error(feil);

    retningVisning.textContent =
      "Fekk ikkje tilgang til mikrofon";
  }
}


async function stoppTuner() {
  tunerAktiv = false;

  if (animationFrame) {
    cancelAnimationFrame(
      animationFrame
    );

    animationFrame = null;
  }

  if (mikrofonStream) {
    mikrofonStream
      .getTracks()
      .forEach(function (track) {
        track.stop();
      });
  }

  if (tunerContext) {
    try {
      await tunerContext.close();
    } catch (feil) {
      console.log(feil);
    }
  }

  mikrofonStream = null;
  mikrofon = null;
  analyser = null;
  tunerContext = null;

  frekvensHistorikk = [];
  glattFrekvens = null;

  startTunerKnapp.textContent =
    "Start tuner";

  toneVisning.textContent = "–";
  centVisning.textContent = "0 cent";

  retningVisning.textContent =
    "Start tuneren";

  tunerDisplay.classList.remove(
    "riktig",
    "feil"
  );
}


startTunerKnapp.addEventListener(
  "click",
  function () {
    if (tunerAktiv) {
      stoppTuner();
    } else {
      startTuner();
    }
  }
);


// =====================================================
// SHRUTI BOX / TUBA
// =====================================================

const shrutiToneVeljar =
  document.getElementById("shrutiTone");

const berreGrunntoneKnapp =
  document.getElementById(
    "berreGrunntone"
  );

const medKvintKnapp =
  document.getElementById("medKvint");

const shrutiVisning =
  document.getElementById(
    "shrutiVisning"
  );

const shrutiInfo =
  document.getElementById(
    "shrutiInfo"
  );

const startShrutiKnapp =
  document.getElementById(
    "startShruti"
  );


let shrutiContext = null;
let shrutiMaster = null;
let shrutiAktiv = false;
let shrutiStemmer = [];
let shrutiMedKvint = false;


const shrutiFrekvensar = {
  C: 65.406,
  Cs: 69.296,
  D: 73.416,
  Ds: 77.782,
  E: 82.407,
  F: 87.307,
  Fs: 92.499,
  G: 97.999,
  Gs: 103.826,
  A: 110.000,
  As: 116.541,
  B: 123.471
};


const shrutiNamn = {
  C: "C",
  Cs: "C♯ / D♭",
  D: "D",
  Ds: "D♯ / E♭",
  E: "E",
  F: "F",
  Fs: "F♯ / G♭",
  G: "G",
  Gs: "G♯ / A♭",
  A: "A",
  As: "A♯ / B♭",
  B: "H / B"
};


function lagTubaStemme(frekvens) {
  const no =
    shrutiContext.currentTime;

  const stemmeGain =
    shrutiContext.createGain();

  const filter =
    shrutiContext.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.value = 750;
  filter.Q.value = 1.2;

  const partialar = [
    [1, 0.50],
    [2, 0.24],
    [3, 0.12],
    [4, 0.07],
    [5, 0.035]
  ];

  const oscillatorar = [];

  partialar.forEach(function (partial) {
    const osc =
      shrutiContext.createOscillator();

    const gain =
      shrutiContext.createGain();

    osc.type = "sine";

    osc.frequency.value =
      frekvens * partial[0];

    gain.gain.value =
      partial[1];

    osc.connect(gain);
    gain.connect(filter);

    oscillatorar.push({
      osc: osc,
      gain: gain
    });
  });

  const bufferLengde =
    shrutiContext.sampleRate * 2;

  const stoyBuffer =
    shrutiContext.createBuffer(
      1,
      bufferLengde,
      shrutiContext.sampleRate
    );

  const data =
    stoyBuffer.getChannelData(0);

  for (
    let i = 0;
    i < bufferLengde;
    i++
  ) {
    data[i] =
      Math.random() * 2 - 1;
  }

  const stoy =
    shrutiContext.createBufferSource();

  stoy.buffer = stoyBuffer;
  stoy.loop = true;

  const stoyFilter =
    shrutiContext.createBiquadFilter();

  stoyFilter.type = "bandpass";
  stoyFilter.frequency.value = 450;
  stoyFilter.Q.value = 0.7;

  const stoyGain =
    shrutiContext.createGain();

  stoyGain.gain.value = 0.008;

  stoy.connect(stoyFilter);
  stoyFilter.connect(stoyGain);
  stoyGain.connect(stemmeGain);

  const lfo =
    shrutiContext.createOscillator();

  const lfoGain =
    shrutiContext.createGain();

  lfo.frequency.value = 4.3;
  lfoGain.gain.value = 0.35;

  lfo.connect(lfoGain);

  oscillatorar.forEach(function (element) {
    lfoGain.connect(
      element.osc.frequency
    );
  });

  const pustLfo =
    shrutiContext.createOscillator();

  const pustGain =
    shrutiContext.createGain();

  pustLfo.frequency.value = 0.35;
  pustGain.gain.value = 0.025;

  pustLfo.connect(pustGain);
  pustGain.connect(
    stemmeGain.gain
  );

  filter.connect(stemmeGain);
  stemmeGain.connect(shrutiMaster);

  stemmeGain.gain.setValueAtTime(
    0.0001,
    no
  );

  stemmeGain.gain.exponentialRampToValueAtTime(
    0.55,
    no + 0.8
  );

  oscillatorar.forEach(function (element) {
    element.osc.start();
  });

  stoy.start();
  lfo.start();
  pustLfo.start();

  return {
    oscillatorar: oscillatorar,
    stoy: stoy,
    lfo: lfo,
    pustLfo: pustLfo,
    gain: stemmeGain
  };
}


function stoppTubaStemme(stemme) {
  const no =
    shrutiContext.currentTime;

  stemme.gain.gain.cancelScheduledValues(
    no
  );

  stemme.gain.gain.setValueAtTime(
    Math.max(
      stemme.gain.gain.value,
      0.0001
    ),
    no
  );

  stemme.gain.gain.exponentialRampToValueAtTime(
    0.0001,
    no + 0.35
  );

  setTimeout(function () {
    stemme.oscillatorar.forEach(
      function (element) {
        try {
          element.osc.stop();
        } catch (e) {}
      }
    );

    try {
      stemme.stoy.stop();
    } catch (e) {}

    try {
      stemme.lfo.stop();
    } catch (e) {}

    try {
      stemme.pustLfo.stop();
    } catch (e) {}

  }, 400);
}


async function startShruti() {
  shrutiContext =
    new AudioContext();

  if (
    shrutiContext.state ===
    "suspended"
  ) {
    await shrutiContext.resume();
  }

  shrutiMaster =
    shrutiContext.createGain();

  shrutiMaster.gain.value = 0.38;

  const masterFilter =
    shrutiContext.createBiquadFilter();

  masterFilter.type = "lowpass";
  masterFilter.frequency.value = 1100;
  masterFilter.Q.value = 0.6;

  shrutiMaster.connect(masterFilter);

  masterFilter.connect(
    shrutiContext.destination
  );

  const valdTone =
    shrutiToneVeljar.value;

  const grunnFrekvens =
    shrutiFrekvensar[valdTone];

  shrutiStemmer.push(
    lagTubaStemme(
      grunnFrekvens
    )
  );

  if (shrutiMedKvint) {
    const kvintFrekvens =
      grunnFrekvens *
      Math.pow(2, 7 / 12);

    shrutiStemmer.push(
      lagTubaStemme(
        kvintFrekvens
      )
    );
  }

  shrutiAktiv = true;

  startShrutiKnapp.textContent =
    "Stopp drone";
}


function stoppShruti() {
  if (!shrutiContext) {
    return;
  }

  shrutiStemmer.forEach(
    function (stemme) {
      stoppTubaStemme(stemme);
    }
  );

  shrutiStemmer = [];
  shrutiAktiv = false;

  startShrutiKnapp.textContent =
    "Start drone";

  const contextSomSkalLukkast =
    shrutiContext;

  setTimeout(function () {
    try {
      contextSomSkalLukkast.close();
    } catch (e) {}
  }, 500);

  shrutiContext = null;
  shrutiMaster = null;
}


function oppdaterShrutiVisning() {
  const tone =
    shrutiToneVeljar.value;

  shrutiVisning.textContent =
    shrutiNamn[tone];

  shrutiInfo.textContent =
    shrutiMedKvint
      ? "Grunntone + kvint"
      : "Grunntone";
}


function restartShruti() {
  if (!shrutiAktiv) {
    return;
  }

  stoppShruti();

  setTimeout(function () {
    startShruti();
  }, 550);
}


shrutiToneVeljar.addEventListener(
  "change",
  function () {
    oppdaterShrutiVisning();
    restartShruti();
  }
);


berreGrunntoneKnapp.addEventListener(
  "click",
  function () {
    shrutiMedKvint = false;

    berreGrunntoneKnapp
      .classList.add("aktiv");

    medKvintKnapp
      .classList.remove("aktiv");

    oppdaterShrutiVisning();
    restartShruti();
  }
);


medKvintKnapp.addEventListener(
  "click",
  function () {
    shrutiMedKvint = true;

    medKvintKnapp
      .classList.add("aktiv");

    berreGrunntoneKnapp
      .classList.remove("aktiv");

    oppdaterShrutiVisning();
    restartShruti();
  }
);


startShrutiKnapp.addEventListener(
  "click",
  function () {
    if (shrutiAktiv) {
      stoppShruti();
    } else {
      startShruti();
    }
  }
);


oppdaterShrutiVisning();


// =====================================================
// FINGERSETTING
// =====================================================

const instrumentVeljar =
  document.getElementById("instrument");

const toneModusKnapp =
  document.getElementById("toneModus");

const akkordModusKnapp =
  document.getElementById("akkordModus");

const toneValOmrade =
  document.getElementById(
    "toneValOmrade"
  );

const akkordValOmrade =
  document.getElementById(
    "akkordValOmrade"
  );

const fingersettingTone =
  document.getElementById(
    "fingersettingTone"
  );

const akkordGrunntone =
  document.getElementById(
    "akkordGrunntone"
  );

const akkordType =
  document.getElementById(
    "akkordType"
  );

const fingersettingOverskrift =
  document.getElementById(
    "fingersettingOverskrift"
  );

const instrumentDiagram =
  document.getElementById(
    "instrumentDiagram"
  );


let fingersettingModus = "tone";


const instrumentNamn = {
  gitar: "Gitar",
  bass: "Bass",
  piano: "Piano",
  klarinett: "B♭-klarinett",
  floyte: "Fløyte",
  altsaksofon: "Altsaksofon",
  kornett: "Kornett",
  bariton: "Bariton"
};


// =====================================================
// PIANO – TONAR
// =====================================================

const toneTilTal = {
  C: 0,
  Cs: 1,
  D: 2,
  Ds: 3,
  E: 4,
  F: 5,
  Fs: 6,
  G: 7,
  Gs: 8,
  A: 9,
  As: 10,
  B: 11
};


const toneNamn = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "H"
];


const svarteToneklassar =
  new Set([1, 3, 6, 8, 10]);


// =====================================================
// AKKORDSTRUKTUR
// Alle intervall går OPPOVER frå grunntonen.
// =====================================================

const akkordIntervall = {
  dur: [0, 4, 7],

  moll: [0, 3, 7],

  "7": [0, 4, 7, 10],

  maj7: [0, 4, 7, 11],

  m7: [0, 3, 7, 10],

  "6": [0, 4, 7, 9],

  m6: [0, 3, 7, 9],

  sus2: [0, 2, 7],

  sus4: [0, 5, 7],

  dim: [0, 3, 6],

  aug: [0, 4, 8],

  maj9: [0, 4, 7, 11, 14],

  "9": [0, 4, 7, 10, 14],

  m9: [0, 3, 7, 10, 14]
};


const akkordEnding = {
  dur: "",
  moll: "m",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  "6": "6",
  m6: "m6",
  sus2: "sus2",
  sus4: "sus4",
  dim: "dim",
  aug: "aug",
  maj9: "maj9",
  "9": "9",
  m9: "m9"
};


// =====================================================
// PIANO – BYGG AKKORD
// =====================================================

function byggAkkord(
  grunntone,
  type
) {
  const grunn =
    toneTilTal[grunntone];

  const intervall =
    akkordIntervall[type];

  return intervall.map(
    function (steg) {
      return grunn + steg;
    }
  );
}


// =====================================================
// PIANO – DIAGRAM
// =====================================================

function lagPiano(
  grunntone,
  markerteNotar,
  akkordmodus
) {
  instrumentDiagram.innerHTML = "";

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "piano-wrapper";


  const piano =
    document.createElement("div");

  piano.className =
    "piano piano-stor";


  const start =
    toneTilTal[grunntone];

  /*
    Vi viser TO HEILE OKTAVAR
    frå den valde grunntonen.

    C -> C ... C
    G -> G ... G

    Dermed er grunntonen alltid
    den lågaste tonen i akkordmodus.
  */

  for (
    let steg = 0;
    steg <= 24;
    steg++
  ) {
    const absoluttTone =
      start + steg;

    const toneklasse =
      ((absoluttTone % 12) + 12) % 12;

    const erSvart =
      svarteToneklassar.has(
        toneklasse
      );

    const tangent =
      document.createElement("div");

    tangent.className =
      erSvart
        ? "piano-tangent piano-svart"
        : "piano-tangent piano-kvit";


    let markert = false;


    if (akkordmodus) {
      /*
        VIKTIG:

        Vi samanliknar ABSOLUTTE
        halvtonesteg.

        Cmaj9:
        0, 4, 7, 11, 14

        D-en er altså 14,
        ikkje 2.

        Dermed kan ingen akkordtone
        hamne under grunntonen.
      */

      markert =
        markerteNotar.includes(
          absoluttTone
        );

    } else {
      /*
        I tonemodus viser vi
        grunntonen i begge oktavar.
      */

      markert =
        steg === 0 ||
        steg === 12 ||
        steg === 24;
    }


    if (markert) {
      tangent.classList.add(
        "markert"
      );

      const etikett =
        document.createElement("span");

      etikett.className =
        "piano-note-namn";

      etikett.textContent =
        toneNamn[toneklasse];

      tangent.appendChild(
        etikett
      );
    }


    piano.appendChild(tangent);
  }


  wrapper.appendChild(piano);
  instrumentDiagram.appendChild(
    wrapper
  );
}


// =====================================================
// OPPDATER FINGERSETTING
// =====================================================

function oppdaterFingersetting() {
  const instrument =
    instrumentVeljar.value;


  // ---------------------------------------------------
  // ANDRE INSTRUMENT
  // ---------------------------------------------------

  if (instrument !== "piano") {
    const namn =
      instrumentNamn[instrument];

    let val;

    if (
      fingersettingModus === "tone"
    ) {
      val =
        toneNamn[
          toneTilTal[
            fingersettingTone.value
          ]
        ];
    } else {
      val =
        toneNamn[
          toneTilTal[
            akkordGrunntone.value
          ]
        ] +
        akkordEnding[
          akkordType.value
        ];
    }

    fingersettingOverskrift.textContent =
      namn + " – " + val;

    instrumentDiagram.innerHTML =
      "<div>Diagram for " +
      namn +
      " kjem snart.</div>";

    return;
  }


  // ---------------------------------------------------
  // PIANO – TONE
  // ---------------------------------------------------

  if (
    fingersettingModus === "tone"
  ) {
    const tone =
      fingersettingTone.value;

    const namn =
      toneNamn[
        toneTilTal[tone]
      ];

    fingersettingOverskrift.textContent =
      "Piano – " + namn;

    lagPiano(
      tone,
      [],
      false
    );

    return;
  }


  // ---------------------------------------------------
  // PIANO – AKKORD
  // ---------------------------------------------------

  const grunn =
    akkordGrunntone.value;

  const type =
    akkordType.value;

  const akkord =
    byggAkkord(
      grunn,
      type
    );

  const akkordNamn =
    toneNamn[
      toneTilTal[grunn]
    ] +
    akkordEnding[type];

  fingersettingOverskrift.textContent =
    "Piano – " +
    akkordNamn;

  lagPiano(
    grunn,
    akkord,
    true
  );
}


// =====================================================
// TONE / AKKORD-KNAPPAR
// =====================================================

toneModusKnapp.addEventListener(
  "click",
  function () {
    fingersettingModus = "tone";

    toneModusKnapp
      .classList.add("aktiv");

    akkordModusKnapp
      .classList.remove("aktiv");

    toneValOmrade
      .classList.remove("skjult");

    akkordValOmrade
      .classList.add("skjult");

    oppdaterFingersetting();
  }
);


akkordModusKnapp.addEventListener(
  "click",
  function () {
    fingersettingModus = "akkord";

    akkordModusKnapp
      .classList.add("aktiv");

    toneModusKnapp
      .classList.remove("aktiv");

    akkordValOmrade
      .classList.remove("skjult");

    toneValOmrade
      .classList.add("skjult");

    oppdaterFingersetting();
  }
);


// =====================================================
// VAL
// =====================================================

instrumentVeljar.addEventListener(
  "change",
  oppdaterFingersetting
);

fingersettingTone.addEventListener(
  "change",
  oppdaterFingersetting
);

akkordGrunntone.addEventListener(
  "change",
  oppdaterFingersetting
);

akkordType.addEventListener(
  "change",
  oppdaterFingersetting
);


// Første visning

oppdaterFingersetting();
// =====================================================
// GITAR V1
// =====================================================

const gitarStemming = ["E", "A", "D", "G", "H", "E"];

/*
  fret:
  -1 = ikkje spel strengen
   0 = open streng
   1+ = band

  finger:
   0 = open / ikkje brukt
   1 = peikefinger
   2 = langfinger
   3 = ringfinger
   4 = lillefinger
*/

const gitarAkkordar = {

  // -------------------------
  // C
  // -------------------------

  "C-dur": {
    frets:   [-1, 3, 2, 0, 1, 0],
    fingers: [ 0, 3, 2, 0, 1, 0]
  },

  "C-moll": {
    frets:   [-1, 3, 5, 5, 4, 3],
    fingers: [ 0, 1, 3, 4, 2, 1],
    barre: {
      fret: 3,
      from: 1,
      to: 5
    }
  },

  "C-7": {
    frets:   [-1, 3, 2, 3, 1, 0],
    fingers: [ 0, 3, 2, 4, 1, 0]
  },

  "C-maj7": {
    frets:   [-1, 3, 2, 0, 0, 0],
    fingers: [ 0, 3, 2, 0, 0, 0]
  },


  // -------------------------
  // D
  // -------------------------

  "D-dur": {
    frets:   [-1, -1, 0, 2, 3, 2],
    fingers: [ 0,  0, 0, 1, 3, 2]
  },

  "D-moll": {
    frets:   [-1, -1, 0, 2, 3, 1],
    fingers: [ 0,  0, 0, 2, 3, 1]
  },

  "D-7": {
    frets:   [-1, -1, 0, 2, 1, 2],
    fingers: [ 0,  0, 0, 2, 1, 3]
  },

  "D-maj7": {
    frets:   [-1, -1, 0, 2, 2, 2],
    fingers: [ 0,  0, 0, 1, 1, 1],
    barre: {
      fret: 2,
      from: 3,
      to: 5
    }
  },


  // -------------------------
  // E
  // -------------------------

  "E-dur": {
    frets:   [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0]
  },

  "E-moll": {
    frets:   [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0]
  },

  "E-7": {
    frets:   [0, 2, 0, 1, 0, 0],
    fingers: [0, 2, 0, 1, 0, 0]
  },

  "E-maj7": {
    frets:   [0, 2, 1, 1, 0, 0],
    fingers: [0, 3, 1, 2, 0, 0]
  },


  // -------------------------
  // F
  // -------------------------

  "F-dur": {
    frets:   [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre: {
      fret: 1,
      from: 0,
      to: 5
    }
  },

  "F-moll": {
    frets:   [1, 3, 3, 1, 1, 1],
    fingers: [1, 3, 4, 1, 1, 1],
    barre: {
      fret: 1,
      from: 0,
      to: 5
    }
  },

  "F-maj7": {
    frets:   [-1, -1, 3, 2, 1, 0],
    fingers: [ 0,  0, 3, 2, 1, 0]
  },


  // -------------------------
  // G
  // -------------------------

  "G-dur": {
    frets:   [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3]
  },

  "G-moll": {
    frets:   [3, 5, 5, 3, 3, 3],
    fingers: [1, 3, 4, 1, 1, 1],
    barre: {
      fret: 3,
      from: 0,
      to: 5
    }
  },

  "G-7": {
    frets:   [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1]
  },

  "G-maj7": {
    frets:   [3, 2, 0, 0, 0, 2],
    fingers: [3, 1, 0, 0, 0, 2]
  },


  // -------------------------
  // A
  // -------------------------

  "A-dur": {
    frets:   [-1, 0, 2, 2, 2, 0],
    fingers: [ 0, 0, 1, 2, 3, 0]
  },

  "A-moll": {
    frets:   [-1, 0, 2, 2, 1, 0],
    fingers: [ 0, 0, 2, 3, 1, 0]
  },

  "A-7": {
    frets:   [-1, 0, 2, 0, 2, 0],
    fingers: [ 0, 0, 2, 0, 3, 0]
  },

  "A-maj7": {
    frets:   [-1, 0, 2, 1, 2, 0],
    fingers: [ 0, 0, 2, 1, 3, 0]
  },


  // -------------------------
  // H / B
  // -------------------------

  "B-dur": {
    frets:   [-1, 2, 4, 4, 4, 2],
    fingers: [ 0, 1, 3, 3, 3, 1],
    barre: {
      fret: 2,
      from: 1,
      to: 5
    }
  },

  "B-moll": {
    frets:   [-1, 2, 4, 4, 3, 2],
    fingers: [ 0, 1, 3, 4, 2, 1],
    barre: {
      fret: 2,
      from: 1,
      to: 5
    }
    
  },

  "B-7": {
    frets:   [-1, 2, 1, 2, 0, 2],
    fingers: [ 0, 2, 1, 3, 0, 4]
  }
  
};



// =====================================================
// GITAR – KOMPLETT AKKORDBIBLIOTEK
// Dur/moll: vanlege opne grep blir bevarte der dei finst.
// Utvida akkordar: standardiserte, flyttbare gitarvoicingar.
// =====================================================

function flyttForm(form, steg) {
  const resultat = {
    frets: form.frets.map(function (f) {
      return f < 0 ? -1 : f + steg;
    }),
    fingers: form.fingers.slice()
  };

  if (form.barre) {
    resultat.barre = {
      fret: form.barre.fret + steg,
      from: form.barre.from,
      to: form.barre.to
    };
  }

  return resultat;
}

// A-formfamilie. Grunntonen ligg på 5. streng.
// Basen er lagd på B (2. band), slik at alle tala er faktiske band.
const gitarAFormer = {
  dur:   { frets:[-1,2,4,4,4,2], fingers:[0,1,3,3,3,1], barre:{fret:2,from:1,to:5} },
  moll:  { frets:[-1,2,4,4,3,2], fingers:[0,1,3,4,2,1], barre:{fret:2,from:1,to:5} },
  "7":   { frets:[-1,2,4,2,4,2], fingers:[0,1,3,1,4,1], barre:{fret:2,from:1,to:5} },
  maj7:  { frets:[-1,2,4,3,4,2], fingers:[0,1,3,2,4,1], barre:{fret:2,from:1,to:5} },
  m7:    { frets:[-1,2,4,2,3,2], fingers:[0,1,3,1,2,1], barre:{fret:2,from:1,to:5} },
  "6":   { frets:[-1,2,4,4,4,4], fingers:[0,1,2,2,2,2], barre:{fret:4,from:2,to:5} },
  m6:    { frets:[-1,2,4,4,3,4], fingers:[0,1,3,4,2,4] },
  sus2:  { frets:[-1,2,4,4,2,2], fingers:[0,1,3,4,1,1], barre:{fret:2,from:1,to:5} },
  sus4:  { frets:[-1,2,4,4,5,2], fingers:[0,1,2,3,4,1], barre:{fret:2,from:1,to:5} },
  dim:   { frets:[-1,2,3,4,3,-1], fingers:[0,1,2,4,3,0] },
  maj9:  { frets:[-1,2,1,3,2,-1], fingers:[0,2,1,4,3,0] },
  "9":   { frets:[-1,2,1,2,2,2], fingers:[0,2,1,3,3,3] },
  m9:    { frets:[-1,2,0,2,2,2], fingers:[0,2,0,3,3,3] }
};

// Aug fungerer ryddigare som E-form med grunntone på 6. streng.
// Basen er Faug på 1. band.
const gitarAugEForm = {
  frets:[1,4,3,2,2,1],
  fingers:[1,4,3,2,2,1],
  barre:{fret:1,from:0,to:5}
};

const gitarGrunntonar = ["C","Cs","D","Ds","E","F","Fs","G","Gs","A","As","B"];
const gitarTypar = ["dur","moll","7","maj7","m7","6","m6","sus2","sus4","dim","aug","maj9","9","m9"];

function lagFlyttbartGitargrep(grunn, type) {
  const grunntal = toneTilTal[grunn];

  if (type === "aug") {
    let steg = grunntal - toneTilTal.F;
    while (steg < 0) steg += 12;
    return flyttForm(gitarAugEForm, steg);
  }

  const form = gitarAFormer[type];
  if (!form) return null;

  // B-forma er basen (B = 11). Vi flyttar berre oppover på halsen.
  let steg = grunntal - toneTilTal.B;
  while (steg < 0) steg += 12;

  return flyttForm(form, steg);
}

// Fyll ALLE kombinasjonar i menyen. Eksisterande vanlege grep får stå urørte.
gitarGrunntonar.forEach(function (grunn) {
  gitarTypar.forEach(function (type) {
    const nokkel = grunn + "-" + type;

    if (!gitarAkkordar[nokkel]) {
      gitarAkkordar[nokkel] = lagFlyttbartGitargrep(grunn, type);
    }
  });
});

// =====================================================
// OMSET APPENS AKKORDNAMN TIL GITARDATABASE
// =====================================================

function gitarAkkordNokkel(grunn, type) {

  let gitarType = type;

  if (type === "dur") {
    gitarType = "dur";
  }

  if (type === "moll") {
    gitarType = "moll";
  }

  return grunn + "-" + gitarType;
}


// =====================================================
// LAG GITARDIAGRAM
// =====================================================

function lagGitarDiagram(akkord) {

  instrumentDiagram.innerHTML = "";

  const diagram =
    document.createElement("div");

  diagram.className =
    "gitar-diagram";


  // Finn kva område av halsen vi må vise

  const spelteBand =
    akkord.frets.filter(function (fret) {
      return fret > 0;
    });


  let minsteBand =
    Math.min(...spelteBand);

  let storsteBand =
    Math.max(...spelteBand);


  let startBand = 1;


  // Dersom grepet ligg høgt på halsen,
  // flyttar vi diagrammet opp.

  if (storsteBand > 5) {
    startBand = minsteBand;
  }


  const sluttBand =
    startBand + 4;


  // ---------------------------------------------------
  // OPEN / X
  // ---------------------------------------------------

  const topp =
    document.createElement("div");

  topp.className =
    "gitar-topp";


  akkord.frets.forEach(
    function (fret) {

      const symbol =
        document.createElement("div");

      symbol.className =
        "gitar-symbol";


      if (fret === -1) {
        symbol.textContent = "×";
      }

      else if (fret === 0) {
        symbol.textContent = "○";
      }

      else {
        symbol.textContent = "";
      }


      topp.appendChild(symbol);
    }
  );


  diagram.appendChild(topp);


  // ---------------------------------------------------
  // GRIPEBRETT
  // ---------------------------------------------------

  const brett =
    document.createElement("div");

  brett.className =
    "gitar-brett";


  // Seks vertikale strenger

  for (
    let streng = 0;
    streng < 6;
    streng++
  ) {

    const strengLinje =
      document.createElement("div");

    strengLinje.className =
      "gitar-streng";


    strengLinje.style.left =
      (streng * 20) + "%";


    brett.appendChild(
      strengLinje
    );
  }


  // Seks horisontale strekar:
  // sadel/topp + fem band

  for (
    let linje = 0;
    linje <= 5;
    linje++
  ) {

    const bandLinje =
      document.createElement("div");

    bandLinje.className =
      "gitar-bandlinje";


    bandLinje.style.top =
      (linje * 20) + "%";


    if (
      linje === 0 &&
      startBand === 1
    ) {
      bandLinje.classList.add(
        "gitar-sadel"
      );
    }


    brett.appendChild(
      bandLinje
    );
  }


  // Bandnummer dersom diagrammet
  // ikkje startar på første band

  if (startBand > 1) {

    const bandNummer =
      document.createElement("div");

    bandNummer.className =
      "gitar-bandnummer";

    bandNummer.textContent =
      startBand + ". band";


    brett.appendChild(
      bandNummer
    );
  }


  // ---------------------------------------------------
  // BARRÉ
  // ---------------------------------------------------

  if (akkord.barre) {

    const barreBand =
      akkord.barre.fret;


    if (
      barreBand >= startBand &&
      barreBand <= sluttBand
    ) {

      const barre =
        document.createElement("div");

      barre.className =
        "gitar-barre";


      const fra =
        akkord.barre.from;

      const til =
        akkord.barre.to;


      barre.style.left =
        (fra * 20) + "%";


      barre.style.width =
        ((til - fra) * 20) + "%";


      const lokalBand =
        barreBand -
        startBand;


      barre.style.top =
        (
          lokalBand * 20 +
          10
        ) + "%";


      barre.textContent = "1";


      brett.appendChild(barre);
    }
  }


  // ---------------------------------------------------
  // FINGRAR
  // ---------------------------------------------------

  akkord.frets.forEach(
    function (fret, streng) {

      if (fret <= 0) {
        return;
      }


      // Ikkje teikn individuelle
      // peikefingerprikkar dersom
      // dei allereie er del av barré.

      if (
        akkord.barre &&
        fret === akkord.barre.fret &&
        streng >= akkord.barre.from &&
        streng <= akkord.barre.to &&
        akkord.fingers[streng] === 1
      ) {
        return;
      }


      const lokalBand =
        fret - startBand;


      if (
        lokalBand < 0 ||
        lokalBand > 4
      ) {
        return;
      }


      const prikk =
        document.createElement("div");

      prikk.className =
        "gitar-finger";


      prikk.style.left =
        (streng * 20) + "%";


      prikk.style.top =
        (
          lokalBand * 20 +
          10
        ) + "%";


      prikk.textContent =
        akkord.fingers[streng];


      brett.appendChild(prikk);
    }
  );


  diagram.appendChild(brett);


  // ---------------------------------------------------
  // STRENGNAMN
  // ---------------------------------------------------

  const stemming =
    document.createElement("div");

  stemming.className =
    "gitar-stemming";


  gitarStemming.forEach(
    function (namn) {

      const strengNamn =
        document.createElement("div");

      strengNamn.textContent =
        namn;


      stemming.appendChild(
        strengNamn
      );
    }
  );


  diagram.appendChild(stemming);


  instrumentDiagram.appendChild(
    diagram
  );
}



// =====================================================
// GITAR – TONEVISNING 0.–12. BAND
// =====================================================

const gitarOpneTonar = [
  toneTilTal["E"], toneTilTal["A"], toneTilTal["D"],
  toneTilTal["G"], toneTilTal["B"], toneTilTal["E"]
];

function lagGitarToneDiagram(valdTone) {
  instrumentDiagram.innerHTML = "";

  const toneTal = toneTilTal[valdTone];
  const diagram = document.createElement("div");
  diagram.className = "gitar-tone-diagram";

  const bandRad = document.createElement("div");
  bandRad.className = "gitar-tone-bandrad";

  const tomHjorne = document.createElement("div");
  bandRad.appendChild(tomHjorne);

  for (let band = 0; band <= 12; band++) {
    const bandNamn = document.createElement("div");
    bandNamn.className = "gitar-tone-bandnummer";
    bandNamn.textContent = band;
    bandRad.appendChild(bandNamn);
  }
  diagram.appendChild(bandRad);

  [...gitarStemming].reverse().forEach(function (strengNamn, visningsIndex) {
    const strengIndex = gitarStemming.length - 1 - visningsIndex;
    const rad = document.createElement("div");
    rad.className = "gitar-tone-strengrad";

    const namn = document.createElement("div");
    namn.className = "gitar-tone-strengnamn";
    namn.textContent = strengNamn;
    rad.appendChild(namn);

    for (let band = 0; band <= 12; band++) {
      const celle = document.createElement("div");
      celle.className = "gitar-tone-celle";

      const strengLinje = document.createElement("div");
      strengLinje.className = "gitar-tone-strenglinje";
      celle.appendChild(strengLinje);

      const denneTonen = (gitarOpneTonar[strengIndex] + band) % 12;

      if (denneTonen === toneTal) {
        const prikk = document.createElement("div");
        prikk.className = "gitar-tone-prikk";
        prikk.textContent = toneNamn[toneTal];
        prikk.title = strengNamn + "-streng, " + band + ". band";
        celle.appendChild(prikk);
      }

      rad.appendChild(celle);
    }

    diagram.appendChild(rad);
  });

  const forklaring = document.createElement("div");
  forklaring.className = "gitar-tone-forklaring";
  forklaring.textContent =
    "Grøn prikk viser " + toneNamn[toneTal] +
    " på kvar streng frå open streng (0) til 12. band.";

  instrumentDiagram.appendChild(diagram);
  instrumentDiagram.appendChild(forklaring);
}



// =====================================================
// BASS – TONEVISNING 0.–12. BAND
// =====================================================

const bassStemming = ["E", "A", "D", "G"];

const bassOpneTonar = [
  toneTilTal["E"],
  toneTilTal["A"],
  toneTilTal["D"],
  toneTilTal["G"]
];

function lagBassToneDiagram(valdTone) {
  instrumentDiagram.innerHTML = "";

  const toneTal = toneTilTal[valdTone];
  const diagram = document.createElement("div");
  diagram.className = "bass-tone-diagram";

  const bandRad = document.createElement("div");
  bandRad.className = "bass-tone-bandrad";

  const tomHjorne = document.createElement("div");
  bandRad.appendChild(tomHjorne);

  for (let band = 0; band <= 12; band++) {
    const bandNamn = document.createElement("div");
    bandNamn.className = "bass-tone-bandnummer";
    bandNamn.textContent = band;
    bandRad.appendChild(bandNamn);
  }

  diagram.appendChild(bandRad);

  [...bassStemming].reverse().forEach(function (strengNamn, visningsIndex) {
    const strengIndex = bassStemming.length - 1 - visningsIndex;
    const rad = document.createElement("div");
    rad.className = "bass-tone-strengrad";

    const namn = document.createElement("div");
    namn.className = "bass-tone-strengnamn";
    namn.textContent = strengNamn;
    rad.appendChild(namn);

    for (let band = 0; band <= 12; band++) {
      const celle = document.createElement("div");
      celle.className = "bass-tone-celle";

      const strengLinje = document.createElement("div");
      strengLinje.className = "bass-tone-strenglinje";
      celle.appendChild(strengLinje);

      const denneTonen =
        (bassOpneTonar[strengIndex] + band) % 12;

      if (denneTonen === toneTal) {
        const prikk = document.createElement("div");
        prikk.className = "bass-tone-prikk";
        prikk.textContent = toneNamn[toneTal];
        prikk.title =
          strengNamn + "-streng, " + band + ". band";
        celle.appendChild(prikk);
      }

      rad.appendChild(celle);
    }

    diagram.appendChild(rad);
  });

  const forklaring = document.createElement("div");
  forklaring.className = "bass-tone-forklaring";
  forklaring.textContent =
    "Grøn prikk viser " +
    toneNamn[toneTal] +
    " på bass frå open streng (0) til 12. band.";

  instrumentDiagram.appendChild(diagram);
  instrumentDiagram.appendChild(forklaring);
}

function oppdaterBass() {
  if (instrumentVeljar.value !== "bass") {
    return false;
  }

  // Bass får førebels tonevisning. Dersom Akkord er valt,
  // viser vi same valde grunntone på gripebrettet.
  let valdTone;

  if (fingersettingModus === "tone") {
    valdTone = fingersettingTone.value;
    fingersettingOverskrift.textContent =
      "Bass – " + toneNamn[toneTilTal[valdTone]];
  } else {
    valdTone = akkordGrunntone.value;
    fingersettingOverskrift.textContent =
      "Bass – " + toneNamn[toneTilTal[valdTone]];
  }

  lagBassToneDiagram(valdTone);
  return true;
}




// =====================================================
// TREBLÅS V3 – 1. OKTAV, SKRIVEN TONE
// Visuell modell inspirert av greptabellane frå Skolekorpsene.
// Raud = trykt/dekt klaff. Kvit = open.
// =====================================================

const treblasInstrument = ["klarinett", "saksofon", "altsaks", "altsaksofon", "floyte"];

// Pedagogisk 1.-oktavsett C–H. Toneverdiane er SKRIVNE tonar.
// Nøklane svarar til dei synlege knappane/klaffane i diagrammet.
const treblasGrep = {
  klarinett: {
    C:  ["th","l1","l2","l3","r1","r2","r3","rp"],
    Cs: ["th","l1","l2","l3","r1","r2","r3"],
    D:  ["th","l1","l2","l3","r1","r2"],
    Ds: ["th","l1","l2","l3","r1","r2","sideR"],
    E:  ["th","l1","l2","l3","r1"],
    F:  ["th","l1","l2","l3"],
    Fs: ["th","l1","l2","l3","sideL"],
    G:  ["th","l1","l2"],
    Gs: ["th","l1","l2","sideL"],
    A:  ["th","l1"],
    As: ["th","l1","aKey"],
    B:  ["th"]
  },
  saksofon: {
    C:  ["l2"],
    Cs: [],
    D:  ["oct","l1","l2","l3","r1","r2","r3"],
    Ds: ["oct","l1","l2","l3","r1","r2","r3","sideR"],
    E:  ["oct","l1","l2","l3","r1","r2"],
    F:  ["oct","l1","l2","l3","r1"],
    Fs: ["oct","l1","l2","l3","r2"],
    G:  ["oct","l1","l2","l3"],
    Gs: ["oct","l1","l2","l3","sideL"],
    A:  ["oct","l1","l2"],
    As: ["oct","l1","l2","sideR"],
    B:  ["oct","l1"]
  },
  floyte: {
    C:  ["th","r3"],
    Cs: [],
    D:  ["th","l1","l2","l3","r1","r2","r3"],
    Ds: ["th","l1","l2","l3","r1","r2","r3","sideR"],
    E:  ["th","l1","l2","l3","r1","r2"],
    F:  ["th","l1","l2","l3","r1"],
    Fs: ["th","l1","l2","l3","r2"],
    G:  ["th","l1","l2","l3"],
    Gs: ["th","l1","l2","l3","sideL"],
    A:  ["th","l1","l2"],
    As: ["th","l1","sideR"],
    B:  ["th","l1"]
  }
};

function treblasKnapp(id, label, aktive) {
  const k = document.createElement("div");
  k.className = "tb-key tb-" + id + (aktive.includes(id) ? " aktiv" : "");
  k.textContent = label || "";
  return k;
}

function lagTreblasDiagram(instrument, valdTone) {
  instrumentDiagram.innerHTML = "";

  const aktive = treblasGrep[instrument][valdTone] || [];
  const tone = toneNamn[toneTilTal[valdTone]];
  const namn = {
    klarinett: "B♭-klarinett",
    saksofon: "Altsaksofon i E♭",
    floyte: "Fløyte"
  };

  const wrap = document.createElement("div");
  wrap.className = "tb-wrap";

  const topp = document.createElement("div");
  topp.className = "tb-topp";
  topp.innerHTML =
    "<div class='tb-instrument'>" + namn[instrument] + "</div>" +
    "<div class='tb-tone'>" + tone + " – 1. oktav</div>" +
    "<div class='tb-sub'>skriven tone</div>";
  wrap.appendChild(topp);

  const diagram = document.createElement("div");
  diagram.className = "tb-diagram " + instrument;

  const kropp = document.createElement("div");
  kropp.className = "tb-kropp";
  diagram.appendChild(kropp);

  // Tommel / register- eller oktavklaff til venstre.
  const tommel = document.createElement("div");
  tommel.className = "tb-side tb-side-venstre";
  if (instrument === "saksofon") {
    tommel.appendChild(treblasKnapp("oct", "O", aktive));
  } else {
    tommel.appendChild(treblasKnapp("th", "T", aktive));
  }
  tommel.appendChild(treblasKnapp("sideL", "", aktive));
  diagram.appendChild(tommel);

  // Hovudklaffar – same leseretning som i greptabellane.
  const hovud = document.createElement("div");
  hovud.className = "tb-hovud";

  const venstreLabel = document.createElement("div");
  venstreLabel.className = "tb-handlabel";
  venstreLabel.textContent = "VENSTRE HAND";
  hovud.appendChild(venstreLabel);

  hovud.appendChild(treblasKnapp("l1", "", aktive));
  hovud.appendChild(treblasKnapp("l2", "", aktive));
  hovud.appendChild(treblasKnapp("l3", "", aktive));

  const skilje = document.createElement("div");
  skilje.className = "tb-skilje";
  hovud.appendChild(skilje);

  const hogreLabel = document.createElement("div");
  hogreLabel.className = "tb-handlabel";
  hogreLabel.textContent = "HØGRE HAND";
  hovud.appendChild(hogreLabel);

  hovud.appendChild(treblasKnapp("r1", "", aktive));
  hovud.appendChild(treblasKnapp("r2", "", aktive));
  hovud.appendChild(treblasKnapp("r3", "", aktive));

  diagram.appendChild(hovud);

  // Side-/lillefingerklaffar.
  const side = document.createElement("div");
  side.className = "tb-side tb-side-hogre";
  side.appendChild(treblasKnapp("aKey", "", aktive));
  side.appendChild(treblasKnapp("sideR", "", aktive));
  side.appendChild(treblasKnapp("rp", "", aktive));
  diagram.appendChild(side);

  wrap.appendChild(diagram);

  const forklaring = document.createElement("div");
  forklaring.className = "tb-forklaring";
  forklaring.innerHTML =
    "<span class='tb-demo aktiv'></span> trykk/dekk &nbsp;&nbsp; " +
    "<span class='tb-demo'></span> open";
  wrap.appendChild(forklaring);

  instrumentDiagram.appendChild(wrap);
}

function oppdaterTreblas() {
  let instrument = instrumentVeljar.value;
  if (!treblasInstrument.includes(instrument)) return false;

  // index.html brukar verdien "altsaks".
  // Fingersettingsdataa heiter "saksofon", så vi koplar dei saman her.
  if (instrument === "altsaks" || instrument === "altsaksofon") {
    instrument = "saksofon";
  }

  const valdTone =
    fingersettingModus === "tone"
      ? fingersettingTone.value
      : akkordGrunntone.value;

  const namn = {
    klarinett: "B♭-klarinett",
    saksofon: "Altsaksofon",
    floyte: "Fløyte"
  };

  fingersettingOverskrift.textContent =
    namn[instrument] + " – " +
    toneNamn[toneTilTal[valdTone]] + " – 1. oktav";

  lagTreblasDiagram(instrument, valdTone);
  return true;
}


// =====================================================
// MESSING V1 – KORNETT OG BARITON
// Skriven tone, 1. oktav. Standard 3 ventilar.
// 0 = open, 1/2/3 = ventil som skal trykkast.
// =====================================================

const messingInstrument = ["kornett", "baritone", "bariton"];

// Standard ventilkombinasjonar for kromatisk skala.
// Dette er pedagogisk visning av ventilgrepet for vald skriven tone.
const messingVentilar = {
  C:  [],
  Cs: [1,2,3],
  D:  [1,3],
  Ds: [2,3],
  E:  [1,2],
  F:  [1],
  Fs: [2],
  G:  [],
  Gs: [2,3],
  A:  [1,2],
  As: [1],
  B:  [2]
};

function lagMessingDiagram(instrument, valdTone) {
  instrumentDiagram.innerHTML = "";

  const tone = toneNamn[toneTilTal[valdTone]];
  const aktive = messingVentilar[valdTone] || [];

  const namn = {
    kornett: "Kornett i B♭",
    baritone: "Bariton i B♭",
    bariton: "Bariton i B♭"
  };

  const wrap = document.createElement("div");
  wrap.className = "messing-wrap";

  const topp = document.createElement("div");
  topp.className = "messing-topp";
  topp.innerHTML =
    "<div class='messing-instrument'>" + namn[instrument] + "</div>" +
    "<div class='messing-tone'>" + tone + " – 1. oktav</div>" +
    "<div class='messing-sub'>skriven tone</div>";
  wrap.appendChild(topp);

  const diagram = document.createElement("div");
  diagram.className = "messing-diagram";

  const ventilRad = document.createElement("div");
  const enkelMessing =
    instrument === "kornett" ||
    instrument === "baritone" ||
    instrument === "bariton";

  ventilRad.className = enkelMessing
    ? "kornett-ventilrad"
    : "messing-ventilrad";

  const ventilRekkefolge = enkelMessing
    ? [3,2,1]
    : [1,2,3];

  ventilRekkefolge.forEach(function (nr) {
    const ventil = document.createElement("div");
    ventil.className =
      (enkelMessing ? "kornett-ventil" : "messing-ventil") +
      (aktive.includes(nr) ? " aktiv" : "");

    const toppknapp = document.createElement("div");
    toppknapp.className =
      enkelMessing
        ? "kornett-ventilknapp"
        : "messing-ventilknapp";
    toppknapp.textContent = nr;

    const stamme = document.createElement("div");
    stamme.className = "messing-ventilstamme";

    const hus = document.createElement("div");
    hus.className = "messing-ventilhus";

    ventil.appendChild(toppknapp);
    ventil.appendChild(stamme);
    ventil.appendChild(hus);
    ventilRad.appendChild(ventil);
  });

  diagram.appendChild(ventilRad);

  const ror = document.createElement("div");
  ror.className = "messing-ror";
  diagram.appendChild(ror);

  wrap.appendChild(diagram);

  const greptekst = document.createElement("div");
  greptekst.className = "messing-greptekst";

  if (aktive.length === 0) {
    greptekst.innerHTML = "<strong>Ope grep</strong> – ingen ventilar";
  } else {
    greptekst.innerHTML =
      "<strong>Ventilar:</strong> " + aktive.join(" + ");
  }

  wrap.appendChild(greptekst);

  const forklaring = document.createElement("div");
  forklaring.className = "messing-forklaring";
  forklaring.innerHTML =
    "<span class='messing-demo aktiv'></span> trykk ned &nbsp;&nbsp; " +
    "<span class='messing-demo'></span> open";
  wrap.appendChild(forklaring);

  instrumentDiagram.appendChild(wrap);
}

function oppdaterMessing() {
  const instrument = instrumentVeljar.value;

  if (!messingInstrument.includes(instrument)) {
    return false;
  }

  const valdTone =
    fingersettingModus === "tone"
      ? fingersettingTone.value
      : akkordGrunntone.value;

  const namn = {
    kornett: "Kornett",
    baritone: "Bariton",
    bariton: "Bariton"
  };

  fingersettingOverskrift.textContent =
    namn[instrument] + " – " +
    toneNamn[toneTilTal[valdTone]] + " – 1. oktav";

  lagMessingDiagram(instrument, valdTone);
  return true;
}



// =====================================================
// KOPLE GITAR TIL FINGERSETTING
// =====================================================

function oppdaterGitar() {

  if (
    instrumentVeljar.value !==
    "gitar"
  ) {
    return false;
  }


  // ---------------------------------------------------
  // TONE
  // ---------------------------------------------------

  if (
    fingersettingModus === "tone"
  ) {

    fingersettingOverskrift.textContent =
      "Gitar – " +
      toneNamn[
        toneTilTal[
          fingersettingTone.value
        ]
      ];


    lagGitarToneDiagram(
      fingersettingTone.value
    );


    return true;
  }


  // ---------------------------------------------------
  // AKKORD
  // ---------------------------------------------------

  const grunn =
    akkordGrunntone.value;

  const type =
    akkordType.value;


  const nokkel =
    gitarAkkordNokkel(
      grunn,
      type
    );


  const akkord =
    gitarAkkordar[nokkel];


  const akkordNamn =
    toneNamn[
      toneTilTal[grunn]
    ] +
    akkordEnding[type];


  fingersettingOverskrift.textContent =
    "Gitar – " +
    akkordNamn;


  if (!akkord) {

    instrumentDiagram.innerHTML =
      "<div class='gitar-ikkje-lagt-inn'>" +
      "Dette gitargrepet er ikkje lagt inn enno." +
      "</div>";


    return true;
  }


  lagGitarDiagram(akkord);


  return true;
}


// =====================================================
// KOPLE GITAR INN I EKSISTERANDE OPPDATERING
// =====================================================

const originalOppdaterFingersetting =
  oppdaterFingersetting;


oppdaterFingersetting =
  function () {

    if (oppdaterGitar()) {
      return;
    }

    if (oppdaterBass()) {
      return;
    }

    if (oppdaterTreblas()) {
      return;
    }

    if (oppdaterMessing()) {
      return;
    }

    originalOppdaterFingersetting();
  };


// Oppdater event listeners til den nye funksjonen

instrumentVeljar.addEventListener(
  "change",
  oppdaterFingersetting
);

fingersettingTone.addEventListener(
  "change",
  oppdaterFingersetting
);

akkordGrunntone.addEventListener(
  "change",
  oppdaterFingersetting
);

akkordType.addEventListener(
  "change",
  oppdaterFingersetting
);

toneModusKnapp.addEventListener(
  "click",
  function () {
    setTimeout(
      oppdaterFingersetting,
      0
    );
  }
);

akkordModusKnapp.addEventListener(
  "click",
  function () {
    setTimeout(
      oppdaterFingersetting,
      0
    );
  }
);