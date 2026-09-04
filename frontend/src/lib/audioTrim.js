/**
 * Client-side audio trim utility.
 * Decodes an audio File, slices [startSec, endSec] and re-encodes to a WAV Blob.
 * No server round-trip needed — perfect for pre-clone silence removal.
 */

async function decode(file) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Web Audio API not supported in this browser");
  const ctx = new AC();
  const buf = await file.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}

function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave PCM
  let offset = 44;
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Decode `file` and return `{ duration, trim(startSec, endSec) → Blob }`.
 * We decode once so the slider can be live without re-parsing on every drag.
 */
export async function prepareAudioForTrim(file) {
  const buffer = await decode(file);
  return {
    duration: buffer.duration,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    async trim(startSec, endSec) {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const start = Math.max(0, Math.min(buffer.duration, startSec));
      const end = Math.max(start + 0.1, Math.min(buffer.duration, endSec));
      const length = Math.floor((end - start) * buffer.sampleRate);
      const off = new AC(buffer.numberOfChannels, length, buffer.sampleRate);
      const src = off.createBufferSource();
      src.buffer = buffer;
      src.connect(off.destination);
      src.start(0, start, end - start);
      const rendered = await off.startRendering();
      return bufferToWav(rendered);
    },
  };
}
