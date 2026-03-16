require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const axios = require('axios');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', brand: 'bcon' }));

// Pre-cache greeting audio on startup
let greetingAudioChunks = null;

async function preloadGreeting() {
  console.log('Pre-loading greeting audio...');
  const raw = await sarvamTTS("Hello! Welcome to BCON Club. How can I help you today?", 'en-IN');
  if (raw) {
    greetingAudioChunks = prepareAudioChunks(raw);
    console.log('Greeting audio ready, chunks:', greetingAudioChunks.length);
  }
}

// Strip WAV header if present, return raw base64
function stripWavHeader(base64Audio) {
  if (base64Audio && base64Audio.startsWith('UklGR')) {
    const buf = Buffer.from(base64Audio, 'base64');
    return buf.slice(44);
  }
  return Buffer.from(base64Audio, 'base64');
}

// Break raw audio buffer into 320-byte chunks (20ms at 8kHz 16-bit mono)
function prepareAudioChunks(base64Audio) {
  const rawBuffer = stripWavHeader(base64Audio);
  const CHUNK_SIZE = 4800; // 300ms at 8kHz, 16-bit mono
  const chunks = [];
  for (let i = 0; i < rawBuffer.length; i += CHUNK_SIZE) {
    const chunk = rawBuffer.slice(i, i + CHUNK_SIZE);
    chunks.push(chunk.toString('base64'));
  }
  return chunks;
}

// Send chunked audio to Vobiz with proper pacing
async function sendChunkedAudio(ws, chunks) {
  for (let i = 0; i < chunks.length; i++) {
    if (ws.readyState !== 1) {
      console.log('WebSocket closed during audio send, stopping at chunk', i);
      return;
    }
    ws.send(JSON.stringify({
      event: 'playAudio',
      media: {
        contentType: 'audio/x-l16',
        sampleRate: 8000,
        payload: chunks[i]
      }
    }));
  }
  console.log('Sent', chunks.length, 'audio chunks to Vobiz');
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('Vobiz connected - BCON');

  let callUUID = null;
  let audioBuffer = [];
  let isProcessing = false;
  let silenceTimer = null;
  let isSpeaking = false;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        callUUID = msg.start?.callId || msg.callId || 'unknown';
        const streamId = msg.start?.streamId || null;
        ws.streamId = streamId;
        console.log(`Call started: ${callUUID}, streamId: ${streamId}`);
        console.log('Media format:', JSON.stringify(msg.start?.mediaFormat));

        // Send cached greeting instantly
        if (greetingAudioChunks && ws.readyState === 1) {
          isSpeaking = true;
          await sendChunkedAudio(ws, greetingAudioChunks);
          isSpeaking = false;
          console.log('Greeting sent from cache');
        } else {
          console.log('No cached greeting, generating...');
          await speakToVobiz(ws, "Hello! Welcome to BCON Club. How can I help you today?", 'en-IN');
        }
      }

      if (msg.event === 'media' && msg.media?.payload) {
        // Skip processing inbound audio while we're speaking (prevents echo)
        if (isSpeaking) return;

        const chunk = Buffer.from(msg.media.payload, 'base64');
        const energy = chunk.reduce((sum, b) => {
          const distFrom7F = Math.abs(b - 0x7F);
          const distFromFF = Math.abs(b - 0xFF);
          return sum + Math.min(distFrom7F, distFromFF);
        }, 0) / chunk.length;
        const isSilence = energy < 5;

        if (!isSilence) {
          audioBuffer.push(chunk);
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }

        if (!isProcessing && audioBuffer.length > 0 && !silenceTimer) {
          silenceTimer = setTimeout(async () => {
            silenceTimer = null;
            if (audioBuffer.length > 20) {
              isProcessing = true;
              const audio = Buffer.concat(audioBuffer);
              audioBuffer = [];

              try {
                const { transcript, language } = await sarvamSTT(audio);
                console.log(`Transcript: "${transcript}"`);

                if (transcript?.trim()) {
                  const response = await getAIResponse(transcript);
                  console.log(`AI Response: "${response}"`);
                  await speakToVobiz(ws, response, 'en-IN');
                }
              } catch (err) {
                console.error('Processing error:', err.message);
              } finally {
                isProcessing = false;
              }
            }
          }, 1500);
        }
      }

      if (msg.event === 'stop') {
        console.log(`Call ended: ${callUUID}`);
        clearTimeout(silenceTimer);
        ws.close();
      }

    } catch (err) {
      console.error('Message error:', err.message);
    }
  });

  ws.on('close', () => {
    clearTimeout(silenceTimer);
    console.log(`Disconnected: ${callUUID}`);
  });
});

async function sarvamSTT(audioBuffer) {
  try {
    function addWavHeader(mulawBuffer) {
      const numChannels = 1;
      const sampleRate = 8000;
      const bitsPerSample = 8;
      const byteRate = sampleRate * numChannels * bitsPerSample / 8;
      const blockAlign = numChannels * bitsPerSample / 8;
      const dataSize = mulawBuffer.length;
      const headerSize = 44;
      const fileSize = headerSize + dataSize - 8;

      const header = Buffer.alloc(headerSize);
      header.write('RIFF', 0);
      header.writeUInt32LE(fileSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(7, 20);
      header.writeUInt16LE(numChannels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      return Buffer.concat([header, mulawBuffer]);
    }

    const FormData = require('form-data');
    const form = new FormData();
    const wavBuffer = addWavHeader(audioBuffer);
    form.append('file', wavBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/x-wav',
    });
    form.append('model', 'saaras:v3');
    form.append('language_code', 'unknown');

    const response = await axios.post(
      'https://api.sarvam.ai/speech-to-text',
      form,
      {
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          ...form.getHeaders(),
        },
      }
    );
    return {
      transcript: response.data?.transcript || '',
      language: response.data?.language_code || 'hi-IN',
    };
  } catch (err) {
    console.error('STT error:', err.response?.data || err.message);
    return { transcript: '', language: 'hi-IN' };
  }
}

async function sarvamTTS(text, language = 'en-IN') {
  try {
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        inputs: [text],
        target_language_code: language,
        speaker: 'anushka',
        model: 'bulbul:v2',
        enable_preprocessing: true,
        encoding: 'pcm',
        sample_rate: 8000,
      },
      {
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    const audio = response.data?.audios?.[0] || null;
    console.log('TTS audio length:', audio?.length || 0);
    return audio;
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message);
    return null;
  }
}

async function speakToVobiz(ws, text, language = 'en-IN') {
  const audio = await sarvamTTS(text, language);
  if (audio && ws.readyState === 1) {
    const chunks = prepareAudioChunks(audio);
    isSpeaking = true;
    await sendChunkedAudio(ws, chunks);
    isSpeaking = false;
  } else {
    console.log('Audio not sent - null or ws closed');
  }
}

async function getAIResponse(transcript) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `You are a voice assistant for BCON Club, a Human x AI business solutions agency. Keep responses to 1-2 sentences. No markdown. No bullet points. Speak naturally for voice calls. Services: AI agents, lead management, business automation. For booking: say "I'll have our team reach out to schedule a call with you." IMPORTANT: Always respond in English only, regardless of what language the user speaks in. Keep responses under 2 sentences.`,
        messages: [{ role: 'user', content: transcript }],
      },
      {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error('Claude error:', err.message);
    return "Sorry, could you please repeat that?";
  }
}

const PORT = process.env.PORT || 3006;
server.listen(PORT, async () => {
  console.log(`BCON Voice server running on port ${PORT}`);
  await preloadGreeting();
});
