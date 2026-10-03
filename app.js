'use strict';

const pads = [...document.querySelectorAll('.pad')];
const sounds = pads.map(() => ({ buffer: null, looping: false, loopTimer: 0 }));
const activeSources = new Set();
let audioContext;
let master;
let recorder;
let chunks = [];
let heldPad = null;
let holdTimer = 0;
let holdTriggered = false;
let shakeArmedAt = 0;
let deferredInstall;
const HOLD_MS = 600;

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
  pad.setAttribute('aria-label', sound.buffer ? `${pad.querySelector('.art').textContent} sound pad${sound.looping ? ', looping' : ''}. Tap to play; hold to toggle loop.` : 'Empty sound pad. Hold to record.');
}

function play(index, loop = false) {
  const sound = sounds[index];
  if (!sound.buffer) return;
  const ctx = audio();
  const source = ctx.createBufferSource();
  source.buffer = sound.buffer; source.loop = loop; source.connect(master); source.start();
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

async function startRecording(index) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    chunks = []; recorder = new MediaRecorder(stream); heldPad = index;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      pads[index].classList.remove('recording');
      try {
        const data = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
        sounds[index].buffer = trim(await audio().decodeAudioData(data));
        setPadState(index); message('Sound saved!');
      } catch (_) { message('Could not save that sound'); }
    };
    recorder.start(); pads[index].classList.add('recording'); message('Recording… let go to finish');
  } catch (_) { message('A grown-up needs to enable the microphone'); }
}

function trim(buffer) {
  const threshold = 0.015;
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
  event.preventDefault();
  const index = Number(event.currentTarget.dataset.pad);
  heldPad = index; holdTriggered = false; shakeArmedAt = Date.now();
  event.currentTarget.classList.add('pressed'); event.currentTarget.setPointerCapture?.(event.pointerId);
  holdTimer = setTimeout(() => {
    holdTriggered = true;
    if (sounds[index].buffer) toggleLoop(index); else startRecording(index);
  }, HOLD_MS);
}

function pointerUp(event) {
  clearTimeout(holdTimer); event.currentTarget.classList.remove('pressed');
  const index = Number(event.currentTarget.dataset.pad);
  if (recorder?.state === 'recording' && heldPad === index) recorder.stop();
  else if (!holdTriggered && sounds[index].buffer) play(index);
  heldPad = null;
}

function pointerCancel(event) {
  clearTimeout(holdTimer); event.currentTarget.classList.remove('pressed');
  if (recorder?.state === 'recording' && heldPad === Number(event.currentTarget.dataset.pad)) recorder.stop();
  heldPad = null;
}

function clearPad(index) {
  const sound = sounds[index];
  sound.looping = false; clearTimeout(sound.loopTimer);
  if (sound.loopSource) { try { sound.loopSource.stop(); } catch (_) {} }
  sound.buffer = null; sound.loopSource = null; setPadState(index); message('Sound cleared');
  if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
}

pads.forEach(pad => {
  pad.addEventListener('pointerdown', pointerDown);
  pad.addEventListener('pointerup', pointerUp);
  pad.addEventListener('pointercancel', pointerCancel);
  pad.addEventListener('contextmenu', event => event.preventDefault());
});

window.addEventListener('devicemotion', event => {
  if (heldPad === null || !sounds[heldPad].buffer || Date.now() - shakeArmedAt < 350) return;
  const a = event.accelerationIncludingGravity;
  if (a && Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2) > 24) { clearTimeout(holdTimer); holdTriggered = true; clearPad(heldPad); heldPad = null; }
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
