'use strict';

const pads = [...document.querySelectorAll('.pad')];
const sounds = pads.map(() => ({ buffer: null, looping: false, loopTimer: 0 }));
const activeSources = new Set();
let audioContext;
let master;
let recordingSession;
let heldPad = null;
let holdTimer = 0;
let holdTriggered = false;
let gesture = null;
const trash = document.querySelector('#trash');
let deferredInstall;
const HOLD_MS = 600;

// Keep one landscape layout for the entire session. Viewport changes only
// rotate and scale this canvas; they never resize individual grid tracks.
const layoutWidth = Math.max(window.innerWidth, window.innerHeight);
const layoutHeight = Math.min(window.innerWidth, window.innerHeight);
const rootStyle = document.documentElement.style;
rootStyle.setProperty('--layout-width', `${layoutWidth}px`);
rootStyle.setProperty('--layout-height', `${layoutHeight}px`);
rootStyle.setProperty('--long-unit', `${layoutWidth / 100}px`);
rootStyle.setProperty('--short-unit', `${layoutHeight / 100}px`);

function fitLayout() {
  const width = window.innerWidth, height = window.innerHeight;
  const portrait = height > width;
  const scale = Math.min(
    (portrait ? height : width) / layoutWidth,
    (portrait ? width : height) / layoutHeight
  );
  rootStyle.setProperty('--layout-turn', portrait ? '90deg' : '0deg');
  rootStyle.setProperty('--layout-scale', scale);
}
fitLayout();
window.addEventListener('resize', fitLayout);

function audio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    master = audioContext.createGain();
    master.gain.value = Number(document.querySelector('#volume').value);
    master.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function message(text) {
  const toast = document.querySelector('#toast');
  toast.textContent = text; toast.classList.add('show');
  clearTimeout(message.timer); message.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function setPadState(index) {
  const pad = pads[index];
  const sound = sounds[index];
  pad.classList.toggle('empty', !sound.buffer);
  pad.classList.toggle('looping', sound.looping);
  pad.setAttribute('aria-label', sound.buffer ? `${pad.dataset.name} sound pad${sound.looping ? ', looping' : ''}. Tap to play; hold to toggle loop; drag to trash to clear.` : `Empty ${pad.dataset.name} sound pad. Hold to record.`);
}

function play(index, loop = false) {
  const sound = sounds[index];
  if (!sound.buffer) return;
  const ctx = audio();
  const source = ctx.createBufferSource();
  source.buffer = sound.buffer; source.loop = loop; source.connect(master); source.start();
  source.padIndex = index;
  activeSources.add(source); source.onended = () => activeSources.delete(source);
  if (!loop) showProgress(index, source, sound.buffer.duration);
  return source;
}

function showProgress(index, source, duration) {
  const progressElement = pads[index].querySelector('.progress');
  const usedIndexes = new Set([...progressElement.children].map(ring => Number(ring.dataset.ringIndex)));
  let ringIndex = 0;
  while (usedIndexes.has(ringIndex)) ringIndex++;
  const ring = document.createElement('i');
  ring.className = 'ring';
  ring.dataset.ringIndex = ringIndex;
  ring.style.setProperty('--ring-index', ringIndex);
  progressElement.append(ring);
  const started = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - started) / (duration * 1000));
    ring.style.setProperty('--progress', `${progress * 100}%`);
    if (progress < 1 && activeSources.has(source)) requestAnimationFrame(frame); else ring.remove();
  }
  requestAnimationFrame(frame);
}

function toggleLoop(index) {
  const sound = sounds[index];
  sound.looping = !sound.looping;
  if (sound.looping) {
    const delay = 400 - (performance.now() % 400);
    sound.loopTimer = setTimeout(() => { if (sound.looping) sound.loopSource = play(index, true); }, delay);
    message('Loop added');
  } else {
    clearTimeout(sound.loopTimer);
    if (sound.loopSource) { try { sound.loopSource.stop(); } catch (_) {} sound.loopSource = null; }
    message('Loop removed');
  }
  setPadState(index);
}

function startRecording(index) {
  const session = { index, chunks: [], recorder: null, stream: null, released: false, save: false };
  recordingSession = session;
  pads[index].classList.add('recording');
  captureRecording(session);
  return session;
}

async function captureRecording(session) {
  const { index } = session;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (recordingSession !== session) { stream.getTracks().forEach(track => track.stop()); pads[index].classList.remove('recording'); return; }
    const mediaRecorder = new MediaRecorder(stream);
    session.stream = stream; session.recorder = mediaRecorder;
    mediaRecorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      pads[index].classList.remove('recording');
      if (recordingSession === session) recordingSession = null;
      if (!session.save) return;
      try {
        const data = await new Blob(session.chunks, { type: mediaRecorder.mimeType }).arrayBuffer();
        sounds[index].buffer = trim(boostRecording(await audio().decodeAudioData(data)));
        setPadState(index); message('Sound saved!');
      } catch (_) { message('Could not save that sound'); }
    };
    mediaRecorder.start();
    if (session.released) mediaRecorder.stop();
  } catch (_) {
    pads[index].classList.remove('recording');
    if (recordingSession === session) recordingSession = null;
    message('A grown-up needs to enable the microphone');
  }
}

function finishRecording(index, save) {
  const session = recordingSession;
  if (!session || session.index !== index) return;
  session.released = true; session.save = save;
  if (session.recorder?.state === 'recording') session.recorder.stop();
}

function boostRecording(buffer) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
  }
  // Apply a predictable 2x boost. Use one gain across channels to preserve
  // balance, leave near-silence alone, and keep peaks below full scale.
  const gain = peak >= 0.001 ? Math.min(2, 0.95 / peak) : 1;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  }
  return buffer;
}

function trim(buffer) {
  const threshold = 0.003;
  let first = buffer.length, last = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let start = 0, end = data.length - 1;
    while (start < data.length && Math.abs(data[start]) < threshold) start++;
    while (end > start && Math.abs(data[end]) < threshold) end--;
    first = Math.min(first, start); last = Math.max(last, end);
  }
  if (last <= first) return buffer;
  const padding = Math.floor(buffer.sampleRate * .04);
  first = Math.max(0, first - padding); last = Math.min(buffer.length, last + padding);
  const result = audio().createBuffer(buffer.numberOfChannels, last - first, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) result.copyToChannel(buffer.getChannelData(channel).subarray(first, last), channel);
  return result;
}

function pointerDown(event) {
  if (gesture || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  const index = Number(event.currentTarget.dataset.pad);
  heldPad = index; holdTriggered = false;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, ghost: null };
  event.currentTarget.classList.add('pressed'); event.currentTarget.setPointerCapture?.(event.pointerId);
  const recording = sounds[index].buffer ? null : startRecording(index);
  holdTimer = setTimeout(() => {
    if (recording && recordingSession !== recording) return;
    holdTriggered = true;
    if (recording) { recording.save = true; message('Recording… let go to finish'); }
  }, HOLD_MS);
}

function overTrash(event) {
  const bounds = trash.getBoundingClientRect();
  return event.clientX >= bounds.left && event.clientX <= bounds.right &&
    event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function pointerMove(event) {
  if (!gesture || gesture.id !== event.pointerId || !sounds[heldPad]?.buffer) return;
  if (!gesture.dragging && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 14) {
    clearTimeout(holdTimer);
    gesture.dragging = true;
    const pad = pads[heldPad];
    pad.classList.remove('pressed');
    pad.classList.add('dragging');
    trash.hidden = false;
    gesture.ghost = document.createElement('div');
    gesture.ghost.className = 'drag-ghost';
    gesture.ghost.setAttribute('aria-hidden', 'true');
    gesture.ghost.style.background = getComputedStyle(pad).backgroundColor;
    gesture.ghost.append(pad.querySelector('.art').cloneNode(true));
    document.body.append(gesture.ghost);
  }
  if (gesture.dragging) {
    gesture.ghost.style.left = `${event.clientX}px`;
    gesture.ghost.style.top = `${event.clientY}px`;
    trash.classList.toggle('over', overTrash(event));
  }
}

function resetGesture() {
  clearTimeout(holdTimer);
  pads[heldPad]?.classList.remove('pressed', 'dragging');
  gesture?.ghost?.remove();
  trash.hidden = true;
  trash.classList.remove('over');
  gesture = null;
  heldPad = null;
}

function pointerUp(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  clearTimeout(holdTimer); event.currentTarget.classList.remove('pressed');
  const index = Number(event.currentTarget.dataset.pad);
  if (gesture.dragging) {
    if (overTrash(event)) clearPad(index);
  } else if (recordingSession?.index === index) finishRecording(index, holdTriggered);
  else if (sounds[index].buffer) {
    if (holdTriggered) toggleLoop(index); else play(index);
  }
  resetGesture();
}

function pointerCancel(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  clearTimeout(holdTimer); event.currentTarget.classList.remove('pressed');
  finishRecording(Number(event.currentTarget.dataset.pad), false);
  resetGesture();
}

function clearPad(index) {
  activeSources.forEach(source => {
    if (source.padIndex === index) {
      try { source.stop(); } catch (_) {}
      activeSources.delete(source);
    }
  });
  pads[index].querySelectorAll('.ring').forEach(ring => ring.remove());
  const sound = sounds[index];
  sound.looping = false; clearTimeout(sound.loopTimer);
  if (sound.loopSource) { try { sound.loopSource.stop(); } catch (_) {} }
  sound.buffer = null; sound.loopSource = null; setPadState(index); message('Sound cleared');
  if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
}

pads.forEach(pad => {
  pad.addEventListener('pointerdown', pointerDown);
  pad.addEventListener('pointermove', pointerMove);
  pad.addEventListener('pointerup', pointerUp);
  pad.addEventListener('pointercancel', pointerCancel);
  pad.addEventListener('lostpointercapture', pointerCancel);
  pad.addEventListener('contextmenu', event => event.preventDefault());
});

window.addEventListener('blur', () => {
  if (heldPad !== null) finishRecording(heldPad, false);
  resetGesture();
});

document.querySelector('#stop').addEventListener('click', () => {
  activeSources.forEach(source => { try { source.stop(); } catch (_) {} }); activeSources.clear();
  sounds.forEach((sound, index) => { sound.looping = false; clearTimeout(sound.loopTimer); sound.loopSource = null; setPadState(index); });
  document.querySelectorAll('.ring').forEach(ring => ring.remove()); message('Everything stopped');
});

const gate = document.querySelector('#gate');
let expectedAnswer = 0;
document.querySelector('#settings').addEventListener('click', () => {
  const left = 10 + Math.floor(Math.random() * 80), right = 10 + Math.floor(Math.random() * (90 - left));
  expectedAnswer = left + right; document.querySelector('#question').textContent = `${left} + ${right} = ?`;
  document.querySelector('#answer').value = ''; document.querySelector('#gate-error').textContent = ''; gate.showModal();
});
document.querySelector('#gate-form').addEventListener('submit', event => {
  event.preventDefault();
  if (Number(document.querySelector('#answer').value) === expectedAnswer) { gate.close(); document.querySelector('#parent').showModal(); }
  else { document.querySelector('#gate-error').textContent = 'Try that one again'; document.querySelector('#answer').select(); }
});
document.querySelector('#close-gate').addEventListener('click', () => gate.close());
document.querySelector('#close-settings').addEventListener('click', () => document.querySelector('#parent').close());
document.querySelector('#volume').addEventListener('input', event => { audio(); master.gain.value = Number(event.target.value); });
document.querySelector('#permission').addEventListener('click', async () => {
  try { const stream = await navigator.mediaDevices.getUserMedia({audio:true}); stream.getTracks().forEach(track => track.stop()); message('Microphone ready'); }
  catch (_) { message('Microphone is blocked in browser settings'); }
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; document.querySelector('#install').hidden = false; });
document.querySelector('#install').addEventListener('click', async () => { if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; document.querySelector('#install').hidden = true; } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
