'use strict'

// ---------- Settings ----------

const LIMITS = {
  rounds: { min: 1, max: 60, def: 5 },
  work: { min: 5, max: 600, def: 60 }, // seconds
  rest: { min: 0, max: 300, def: 10 }, // seconds
}
const STORAGE_KEY = 'sport-clock-settings'

function loadSettings() {
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {}
  const s = {}
  for (const [k, l] of Object.entries(LIMITS)) {
    const v = Number(saved[k])
    s[k] = Number.isFinite(v) ? clamp(v, l.min, l.max) : l.def
  }
  return s
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

let settings = loadSettings()

// ---------- DOM ----------

const $ = (id) => document.getElementById(id)
const el = {
  setup: $('setup'), run: $('run'),
  rounds: $('rounds'), work: $('work'), rest: $('rest'), total: $('total'),
  phase: $('phase'), time: $('time'), round: $('round'), awake: $('awake'),
}

function renderSetup() {
  el.rounds.textContent = settings.rounds
  el.work.textContent = fmt(settings.work)
  el.rest.textContent = settings.rest ? `${settings.rest}s` : 'off'
  el.total.textContent = `Total ${fmt(totalSeconds(buildPhases()))}`
  for (const b of document.querySelectorAll('[data-step]')) {
    const k = b.dataset.step
    const d = Number(b.dataset.delta)
    b.disabled = d < 0 ? settings[k] <= LIMITS[k].min : settings[k] >= LIMITS[k].max
  }
}

document.querySelectorAll('[data-step]').forEach((b) =>
  b.addEventListener('click', () => {
    const k = b.dataset.step
    settings[k] = clamp(settings[k] + Number(b.dataset.delta), LIMITS[k].min, LIMITS[k].max)
    saveSettings()
    renderSetup()
  })
)

// ---------- Timeline ----------

// Rounds of exercise with a rest between them (none after the last round).
function buildPhases() {
  const phases = []
  for (let i = 0; i < settings.rounds; i++) {
    phases.push({ type: 'work', round: i + 1, dur: settings.work })
    if (settings.rest > 0 && i < settings.rounds - 1)
      phases.push({ type: 'rest', round: i + 1, dur: settings.rest })
  }
  return phases
}
const totalSeconds = (phases) => phases.reduce((a, p) => a + p.dur, 0)

// The clock is derived from timestamps, so it stays correct even when the
// browser throttles timers or the tab was in the background.
let session = null // { phases, total, startedAt, pausedAt, lastIndex, timer, doneTimer }

function elapsedMs(now = performance.now()) {
  const ref = session.pausedAt ?? now
  return ref - session.startedAt
}

function locate(elapsedSec) {
  let t = 0
  for (let i = 0; i < session.phases.length; i++) {
    const p = session.phases[i]
    if (elapsedSec < t + p.dur) return { index: i, phase: p, startsAt: t, left: t + p.dur - elapsedSec }
    t += p.dur
  }
  return null // finished
}

function start() {
  audio.unlock()
  const phases = buildPhases()
  session = {
    phases,
    total: totalSeconds(phases),
    startedAt: performance.now(),
    pausedAt: null,
    lastIndex: 0,
    timer: setInterval(tick, 100),
  }
  document.body.classList.remove('paused', 'resting')
  el.setup.hidden = true
  el.run.hidden = false
  wake.acquire()
  audio.whistle(1)
  tick()
}

function stop() {
  if (!session) return
  clearInterval(session.timer)
  clearTimeout(session.doneTimer)
  session = null
  wake.release()
  document.body.classList.remove('paused', 'resting')
  el.run.hidden = true
  el.setup.hidden = false
  renderSetup()
}

function togglePause() {
  if (!session || session.done) return
  const now = performance.now()
  if (session.pausedAt == null) {
    session.pausedAt = now
  } else {
    session.startedAt += now - session.pausedAt
    session.pausedAt = null
  }
  document.body.classList.toggle('paused', session.pausedAt != null)
  tick()
}

function tick() {
  if (!session || session.done) return
  const elapsed = elapsedMs() / 1000
  const pos = locate(elapsed)

  if (!pos) return finish(elapsed - session.total)

  if (pos.index !== session.lastIndex) {
    session.lastIndex = pos.index
    // Skip whistles for transitions that happened while the page was hidden.
    if (elapsed - pos.startsAt < 2) audio.whistle(1)
  }

  const resting = pos.phase.type === 'rest'
  document.body.classList.toggle('resting', resting)
  el.phase.textContent = session.pausedAt != null ? 'Paused' : resting ? 'Rest' : 'Exercise'
  el.time.textContent = resting ? String(Math.ceil(pos.left)) : fmt(Math.ceil(pos.left))
  const totalLeft = Math.ceil(session.total - elapsed)
  el.round.textContent = `Round ${pos.phase.round} of ${settings.rounds} · ${fmt(totalLeft)} left`
}

function finish(lateBy) {
  session.done = true
  clearInterval(session.timer)
  document.body.classList.remove('resting')
  el.phase.textContent = 'Done!'
  el.time.textContent = '0:00'
  el.round.textContent = `${settings.rounds} rounds · ${fmt(session.total)}`
  if (lateBy < 2) audio.whistle(3)
  wake.release()
  session.doneTimer = setTimeout(stop, 6000)
}

$('start').addEventListener('click', start)
$('stop').addEventListener('click', stop)
$('pause').addEventListener('click', togglePause)

// ---------- Audio ----------
// Web Audio gives precise, gap-free scheduling. Safari only allows sound after
// a user tap, so the context is unlocked when Start is pressed.

const audio = (() => {
  let ctx = null
  let buffer = null
  let loading = null

  // iOS 17+: play even when the ring/silent switch is on silent.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {}

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    return ctx
  }

  function load() {
    if (loading) return loading
    loading = fetch('whistle.wav')
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((ok, err) => ensureCtx().decodeAudioData(data, ok, err)))
      .then((b) => (buffer = b))
      .catch((e) => {
        loading = null
        console.warn('Whistle failed to load', e)
      })
    return loading
  }

  function unlock() {
    const c = ensureCtx()
    if (!c) return
    if (c.state !== 'running') c.resume()
    // A silent one-sample buffer fully unlocks output on older iOS.
    const src = c.createBufferSource()
    src.buffer = c.createBuffer(1, 1, 22050)
    src.connect(c.destination)
    src.start(0)
    load()
  }

  async function whistle(times) {
    const c = ensureCtx()
    if (!c) return
    if (c.state !== 'running') {
      try { await c.resume() } catch {}
    }
    if (!buffer) await load()
    if (!buffer) return
    let t = c.currentTime + 0.02
    for (let i = 0; i < times; i++) {
      const src = c.createBufferSource()
      src.buffer = buffer
      src.connect(c.destination)
      src.start(t)
      t += buffer.duration + 0.1
    }
  }

  // Safari may suspend/interrupt the context when the page is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
  })

  return { unlock, whistle, load }
})()

// ---------- Screen Wake Lock ----------
// Keeps the phone from sleeping while the clock runs. Safari 16.4+.
// The lock is dropped by the browser when the page is hidden, so it is
// requested again when the page becomes visible.

const wake = (() => {
  let lock = null
  let wanted = false
  const supported = 'wakeLock' in navigator

  function status(text) {
    el.awake.textContent = text
  }

  async function request() {
    if (!supported || !wanted || lock || document.visibilityState !== 'visible') return
    try {
      lock = await navigator.wakeLock.request('screen')
      lock.addEventListener('release', () => {
        lock = null
        if (wanted) status('Screen may sleep')
      })
      status(wanted ? 'Screen stays on' : '')
      if (!wanted) release()
    } catch (e) {
      status('Screen may sleep')
      console.warn('Wake lock failed', e)
    }
  }

  function acquire() {
    wanted = true
    if (!supported) return status('Keep-awake not supported in this browser')
    request()
  }

  function release() {
    wanted = false
    status('')
    if (lock) lock.release().catch(() => {})
    lock = null
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') request()
  })

  return { acquire, release }
})()

// When returning to the page, update the display immediately.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick()
})

// ---------- Init ----------

renderSetup()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e))
}
