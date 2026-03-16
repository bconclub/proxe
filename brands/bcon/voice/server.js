require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const axios = require('axios');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', brand: 'bcon' }));

// Pre-cache greeting audio on startup
let greetingAudio = null;

async function preloadGreeting() {
  console.log('Pre-loading greeting audio...');
  greetingAudio = await sarvamTTS("Hello! Welcome to BCON Club. How can I help you today?", 'hi-IN');
  console.log('Greeting audio ready, length:', greetingAudio?.length || 0);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('Vobiz connected - BCON');

  let callUUID = null;
  let audioBuffer = [];
  let isProcessing = false;
  let silenceTimer = null;
  let detectedLanguage = 'hi-IN';

  ws.on('message', async (data) => {
    try {
      console.log('RAW MSG:', data.toString().substring(0, 300));
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        callUUID = msg.start?.callId || msg.callId || 'unknown';
        const streamId = msg.start?.streamId || null;
        ws.streamId = streamId;
        console.log(`Call started: ${callUUID}`);

        // Send cached greeting instantly
        if (greetingAudio && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'playAudio',
            streamId: ws.streamId,
            media: {
              track: 'outbound',
              payload: greetingAudio
            }
          }));
          console.log('Greeting sent instantly from cache, streamId:', ws.streamId);
        } else {
          console.log('No cached greeting, generating...');
          await speakToVobiz(ws, "Hello! Welcome to BCON Club. How can I help you today?", 'hi-IN');
        }
      }

      if (msg.event === 'media' && msg.media?.payload) {
        const chunk = Buffer.from(msg.media.payload, 'base64');
        const isSilence = chunk.every(b => b === 0xFF || b === 0x7F || b === 0xFE);

        if (!isSilence) {
          audioBuffer.push(chunk);
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }

        if (!isProcessing && (audioBuffer.length > 0) && !silenceTimer) {
          silenceTimer = setTimeout(async () => {
            silenceTimer = null;
            if (audioBuffer.length > 20) {
              isProcessing = true;
              const audio = Buffer.concat(audioBuffer);
              audioBuffer = [];

              try {
                const { transcript, language } = await sarvamSTT(audio);
                detectedLanguage = language;
                console.log(`Transcript: "${transcript}" | Language: ${language}`);

                if (transcript?.trim()) {
                  const response = await getAIResponse(transcript);
                  console.log(`AI Response: "${response}"`);
                  await speakToVobiz(ws, response, detectedLanguage);
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
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/x-wav',
    });
    form.append('model', 'saaras:v2');
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
    console.log('STT response:', JSON.stringify(response.data).substring(0, 200));
    return {
      transcript: response.data?.transcript || '',
      language: response.data?.language_code || 'hi-IN',
    };
  } catch (err) {
    console.error('STT error:', err.response?.data || err.message);
    return { transcript: '', language: 'hi-IN' };
  }
}

async function sarvamTTS(text, language = 'hi-IN') {
  const speakerMap = {
    'hi-IN': 'anushka', 'en-IN': 'anushka',
    'ta-IN': 'anushka', 'te-IN': 'anushka',
    'kn-IN': 'anushka', 'ml-IN': 'anushka',
  };
  const speaker = speakerMap[language] || 'anushka';
  console.log('TTS request:', { text: text.substring(0, 50), language, speaker });
  try {
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        inputs: [text],
        target_language_code: language,
        speaker: speaker,
        model: 'bulbul:v2',
        enable_preprocessing: true,
        encoding: 'mulaw',
        sample_rate: 8000,
      },
      {
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('TTS response keys:', Object.keys(response.data || {}));
    const audio = response.data?.audios?.[0] || null;
    console.log('TTS audio length:', audio?.length || 0);
    return audio;
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message);
    return null;
  }
}

async function speakToVobiz(ws, text, language = 'hi-IN') {
  const audio = await sarvamTTS(text, language);
  if (audio && ws.readyState === 1) {
    const msg = {
      event: 'playAudio',
      streamId: ws.streamId,
      media: { track: 'outbound', payload: audio }
    };
    console.log('Sending to Vobiz:', JSON.stringify(msg).substring(0, 100));
    ws.send(JSON.stringify(msg));
    console.log('Audio sent to Vobiz');
  } else {
    console.log('Audio not sent - audio null or ws closed, readyState:', ws.readyState);
  }
}

async function getAIResponse(transcript) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `You are a voice assistant for BCON Club, a Human x AI business solutions agency. Keep responses to 1-2 sentences. No markdown. No bullet points. Speak naturally for voice calls. Services: AI agents, lead management, business automation. For booking: say "I'll have our team reach out to schedule a call with you." Reply in the same language the user speaks.`,
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
