require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const axios = require('axios');
const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok', brand: 'bcon' }));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  console.log('Vobiz connected - BCON');
  let callUUID = null;
  let audioBuffer = [];
  let isProcessing = false;
  let silenceTimer = null;
  let detectedLanguage = 'en-IN';
  ws.on('message', async (data) => {
    try {
      console.log('RAW MSG:', data.toString().substring(0, 300));
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        callUUID = msg.start?.callId || msg.callId || 'unknown';
        console.log(`Call started: ${callUUID}`);
        await speakToVobiz(ws, "Hello! Welcome to BCON Club. How can I help you today?", 'hi-IN');
      }
      if (msg.event === 'media' && msg.media?.payload) {
        audioBuffer.push(Buffer.from(msg.media.payload, 'base64'));
        clearTimeout(silenceTimer);
        if (!isProcessing) {
          silenceTimer = setTimeout(async () => {
            if (audioBuffer.length > 10) {
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
          }, 1000);
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
    const response = await axios.post(
      'https://api.sarvam.ai/speech-to-text',
      {
        model: 'saaras:v2',
        audio: audioBuffer.toString('base64'),
        language_code: 'unknown',
      },
      {
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    return {
      transcript: response.data?.transcript || '',
      language: response.data?.language_code || 'en-IN',
    };
  } catch (err) {
    console.error('STT error:', err.response?.data || err.message);
    return { transcript: '', language: 'en-IN' };
  }
}
async function sarvamTTS(text, language = 'en-IN') {
  const speakerMap = {
    'hi-IN': 'anushka',
    'en-IN': 'anushka',
    'ta-IN': 'anushka',
    'te-IN': 'anushka',
    'kn-IN': 'anushka',
    'ml-IN': 'anushka',
  };
  try {
    console.log('TTS request:', { text, language, speaker: speakerMap[language] || 'anushka' })
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        inputs: [text],
        target_language_code: language,
        speaker: speakerMap[language] || 'anushka',
        model: 'bulbul:v2',
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
    return response.data?.audios?.[0] || null;
  } catch (err) {
    console.error('TTS error:', err.response?.data || err.message);
    return null;
  }
}
async function speakToVobiz(ws, text, language = 'en-IN') {
  const audio = await sarvamTTS(text, language);
  if (audio && ws.readyState === 1) {
    ws.send(JSON.stringify({
      event: 'playAudio',
      media: { payload: audio }
    }));
  }
}
async function getAIResponse(transcript) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `You are a voice assistant for BCON Club, a Human x AI business solutions agency.
Keep responses to 1-2 sentences. No markdown. No bullet points. Speak naturally for voice calls.
Services: AI agents, lead management, business automation.
For booking: say "I'll have our team reach out to schedule a call with you."
Reply in the same language the user speaks.`,
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
server.listen(PORT, () => {
  console.log(`BCON Voice server running on port ${PORT}`);
});
