require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', brand: 'bcon' }));

// Pre-cache greeting audio on startup
let greetingAudioChunks = null;

async function preloadGreeting() {
  console.log('Pre-loading greeting audio...');
  const raw = await sarvamTTS("Hi there! Thank you for calling Bee-Con Club. I'm Prox-ee How can I help you today?", 'en-IN');
  if (raw) {
    greetingAudioChunks = prepareAudioChunks(raw);
    console.log('Greeting audio ready, chunks:', greetingAudioChunks.length);
  }
}

// Strip WAV header if present, return raw PCM buffer and sample rate
function stripWavHeader(base64Audio) {
  if (base64Audio && base64Audio.startsWith('UklGR')) {
    const buf = Buffer.from(base64Audio, 'base64');
    const actualSampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const numChannels = buf.readUInt16LE(22);
    console.log('WAV actual sample rate:', actualSampleRate, 'bits:', bitsPerSample, 'channels:', numChannels);
    return { pcm: buf.slice(44), sampleRate: actualSampleRate };
  }
  return { pcm: Buffer.from(base64Audio, 'base64'), sampleRate: 8000 };
}

// Resample 16-bit PCM from srcRate to dstRate using linear interpolation
function resamplePCM(pcmBuffer, srcRate, dstRate) {
  if (srcRate === dstRate) return pcmBuffer;
  const srcSamples = pcmBuffer.length / 2;
  const dstSamples = Math.floor(srcSamples * dstRate / srcRate);
  const output = Buffer.alloc(dstSamples * 2);
  const ratio = srcRate / dstRate;
  for (let i = 0; i < dstSamples; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const s0 = pcmBuffer.readInt16LE(srcIndex * 2);
    const s1 = srcIndex + 1 < srcSamples ? pcmBuffer.readInt16LE((srcIndex + 1) * 2) : s0;
    const sample = Math.round(s0 + frac * (s1 - s0));
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  console.log('Resampled:', srcRate, '->', dstRate, 'samples:', srcSamples, '->', dstSamples);
  return output;
}

// Break raw audio buffer into chunks (300ms at 8kHz 16-bit mono)
function prepareAudioChunks(base64Audio) {
  const { pcm, sampleRate } = stripWavHeader(base64Audio);
  const rawBuffer = resamplePCM(pcm, sampleRate, 8000);
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

function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  cleaned = cleaned.replace(/^\+91/, '').replace(/^91(?=\d{10}$)/, '');
  return cleaned;
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
  let aiFailures = 0;
  let conversationHistory = [];
  let callStartTime = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        callUUID = msg.start?.callId || msg.callId || 'unknown';
        callStartTime = new Date();
        const streamId = msg.start?.streamId || null;
        ws.streamId = streamId;
        console.log(`Call started: ${callUUID}, streamId: ${streamId}`);
        console.log('Media format:', JSON.stringify(msg.start?.mediaFormat));
        console.log('Vobiz start event keys:', JSON.stringify(msg.start));

        // Create lead and voice session in Supabase
        try {
          const extraHeaders = msg.start?.customParameters || msg.start?.extraHeaders || {};
          const callerPhone = extraHeaders.callerPhone || msg.start?.from || msg.start?.callerNumber || msg.start?.caller || null;
          const normalizedPhone = normalizePhone(callerPhone);
          console.log('Caller phone:', callerPhone, '-> normalized:', normalizedPhone);

          if (normalizedPhone) {
            // Upsert lead
            const { data: existingLead } = await supabase
              .from('all_leads')
              .select('id, first_touchpoint')
              .eq('customer_phone_normalized', normalizedPhone)
              .eq('brand', 'bcon')
              .maybeSingle();

            let leadId;
            if (existingLead) {
              leadId = existingLead.id;
              await supabase
                .from('all_leads')
                .update({ last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() })
                .eq('id', leadId);
              console.log('Updated existing lead:', leadId);
            } else {
              const { data: newLead } = await supabase
                .from('all_leads')
                .insert({
                  phone: callerPhone,
                  customer_phone_normalized: normalizedPhone,
                  brand: 'bcon',
                  first_touchpoint: 'voice',
                  last_touchpoint: 'voice',
                  last_interaction_at: new Date().toISOString(),
                })
                .select('id')
                .single();
              leadId = newLead?.id;
              console.log('Created new lead:', leadId);
            }

            ws.leadId = leadId;

            // Create voice session
            if (leadId) {
              const { error: sessErr } = await supabase
                .from('voice_sessions')
                .insert({
                  lead_id: leadId,
                  external_session_id: callUUID,
                  customer_phone: callerPhone,
                  customer_phone_normalized: normalizedPhone,
                  call_status: 'in-progress',
                  call_direction: 'inbound',
                  brand: 'bcon',
                });
              if (sessErr) console.error('Voice session insert error:', sessErr.message);
              else console.log('Voice session created for call:', callUUID);
            }
          }
        } catch (dbErr) {
          console.error('Supabase start error:', dbErr.message);
        }

        // Send cached greeting instantly
        if (greetingAudioChunks && ws.readyState === 1) {
          isSpeaking = true;
          await sendChunkedAudio(ws, greetingAudioChunks);
          isSpeaking = false;
          console.log('Greeting sent from cache');
        } else {
          console.log('No cached greeting, generating...');
          await speakToVobiz(ws, "Hi there! Thank you for calling Bee-Con Club. I'm Prox-ee How can I help you today?", 'en-IN');
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
            if (audioBuffer.length > 10) {
              isProcessing = true;
              const audio = Buffer.concat(audioBuffer);
              audioBuffer = [];

              try {
                const { transcript, language: detectedLanguage } = await sarvamSTT(audio);
                console.log(`Transcript: "${transcript}" [lang: ${detectedLanguage}]`);
                console.log('Detected language:', detectedLanguage, '-> TTS language:', 'en-IN');

                if (!transcript || !transcript.trim() || transcript.trim().length < 2) {
                  console.log('Empty/short transcript, skipping');
                  return;
                }

                if (transcript?.trim()) {
                  // Log user message to Supabase
                  if (ws.leadId) {
                    try {
                      await supabase.from('conversations').insert({
                        lead_id: ws.leadId,
                        channel: 'voice',
                        sender: 'customer',
                        content: transcript,
                      });
                    } catch (dbErr) {
                      console.error('Supabase user msg error:', dbErr.message);
                    }
                  }

                  const response = await getAIResponse(transcript, conversationHistory, detectedLanguage);
                  console.log(`AI Response: "${response}"`);
                  if (response === null) {
                    aiFailures++;
                    console.log('AI failure count:', aiFailures);
                    if (aiFailures >= 2) {
                      await speakToVobiz(ws, "Apologies for the inconvenience. Let me connect you with our team. We will call you back within the next few minutes. Thank you for reaching out to Bee-Con Club.", 'en-IN');
                      ws.close();
                      return;
                    }
                    await speakToVobiz(ws, "I'm having a bit of trouble right now. Someone from our team will call you back shortly. Thank you for your patience.", 'en-IN');
                  } else {
                    aiFailures = 0;

                    // Log assistant message to Supabase
                    if (ws.leadId) {
                      try {
                        await supabase.from('conversations').insert({
                          lead_id: ws.leadId,
                          channel: 'voice',
                          sender: 'agent',
                          content: response,
                        });
                      } catch (dbErr) {
                        console.error('Supabase agent msg error:', dbErr.message);
                      }
                    }

                    await speakToVobiz(ws, response, 'en-IN');
                  }
                }
              } catch (err) {
                console.error('Processing error:', err.message);
              } finally {
                isProcessing = false;
              }
            }
          }, 500);
        }
      }

      if (msg.event === 'stop') {
        console.log(`Call ended: ${callUUID}`);
        clearTimeout(silenceTimer);

        // Update voice session with duration
        if (callUUID && callStartTime) {
          try {
            const durationSecs = Math.round((Date.now() - callStartTime.getTime()) / 1000);
            await supabase
              .from('voice_sessions')
              .update({ call_status: 'completed', call_duration_seconds: durationSecs, updated_at: new Date().toISOString() })
              .eq('external_session_id', callUUID);
            console.log(`Voice session ended: ${callUUID}, duration: ${durationSecs}s`);
          } catch (dbErr) {
            console.error('Supabase stop error:', dbErr.message);
          }
        }

        ws.close();
      }

    } catch (err) {
      console.error('Message error:', err.message);
    }
  });

  ws.on('close', async () => {
    clearTimeout(silenceTimer);
    console.log(`Disconnected: ${callUUID}`);

    // Fallback: update voice session if stop event was missed
    if (callUUID && callStartTime) {
      try {
        const durationSecs = Math.round((Date.now() - callStartTime.getTime()) / 1000);
        await supabase
          .from('voice_sessions')
          .update({ call_status: 'completed', call_duration_seconds: durationSecs, updated_at: new Date().toISOString() })
          .eq('external_session_id', callUUID)
          .eq('call_status', 'in-progress');
      } catch (dbErr) {
        console.error('Supabase close error:', dbErr.message);
      }
    }
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
    form.append('language_code', 'en-IN');

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
        speaker: 'shubh',
        model: 'bulbul:v3',
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
    console.log('TTS audio prefix:', audio?.substring(0, 30));
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

async function getAIResponse(transcript, conversationHistory, detectedLanguage) {
  try {
    conversationHistory.push({ role: 'user', content: '[Caller language: ' + detectedLanguage + '] ' + transcript });

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: `You are Prox-ee, a voice assistant at Bee-Con Club. You talk like a real person on a phone call, not like a scripted bot. How you speak: Short. Casual. Like texting but spoken. Never say "How can I help you today" or "Is there anything else I can help with" or any customer service phrases. Just talk normally. If someone says hi, say hi back. If they ask your name, just say it. Do not over-explain. Do not add filler questions after every answer. Examples of how you talk: "Hey, yeah I'm Prox-ee, the A.I. assistant here at Bee-Con." "We do A.I. agents for businesses, basically automates your sales and follow-ups." "What's your business about?" "Cool, yeah we can definitely help with that." "Want me to get someone from the team to call you back?" What you know: Bee-Con Club builds A.I. agents for businesses. We handle sales automation, lead capture, customer follow-ups, and booking. We work with real estate, education, fitness, travel, consulting, and similar service businesses. Rules: English only. Max 10 to 12 words per response unless explaining something specific. No markdown. No lists. No emojis. Never repeat what the caller said. One thought per response. If you dont understand, just say "Sorry, didn't catch that, one more time?"`,
        messages: conversationHistory,
      },
      {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const aiText = response.data.content[0].text;
    conversationHistory.push({ role: 'assistant', content: aiText });
    return aiText;
  } catch (err) {
    console.error('Claude error:', err.response?.status, JSON.stringify(err.response?.data));
    return null;
  }
}

const PORT = process.env.PORT || 3006;
server.listen(PORT, async () => {
  console.log(`BCON Voice server running on port ${PORT}`);
  await preloadGreeting();
});
