require('dotenv').config();
const express = require('express');
const { WebSocketServer, WebSocket: WS } = require('ws');
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
  return { pcm: Buffer.from(base64Audio, 'base64'), sampleRate: 16000 };
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

// Break raw audio buffer into chunks (300ms at 16kHz 16-bit mono)
function prepareAudioChunks(base64Audio) {
  const { pcm, sampleRate } = stripWavHeader(base64Audio);
  const rawBuffer = sampleRate === 16000 ? pcm : resamplePCM(pcm, sampleRate, 16000);
  const CHUNK_SIZE = 9600; // 300ms at 16kHz, 16-bit mono
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
        sampleRate: 16000,
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

// ============================================
// Deepgram Streaming STT - opens a WebSocket per call
// ============================================
function openDeepgramStream(onTranscript, onError) {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    onError(new Error('DEEPGRAM_API_KEY not set'));
    return null;
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    language: 'multi',
    smart_format: 'true',
    interim_results: 'true',
    endpointing: '300',
    encoding: 'mulaw',
    sample_rate: '8000',
    channels: '1',
  });

  const dgUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  const dgWs = new WS(dgUrl, { headers: { Authorization: `Token ${dgKey}` } });

  let connected = false;
  let firstAudioTime = null;

  dgWs.on('open', () => {
    connected = true;
    console.log('[Deepgram] WebSocket connected');
  });

  dgWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
        const alt = msg.channel.alternatives[0];
        const isFinal = msg.is_final;
        const speechFinal = msg.speech_final;
        const transcript = alt.transcript || '';
        const language = msg.channel?.detected_language || 'en';

        if (isFinal && transcript.trim()) {
          const sttMs = firstAudioTime ? Date.now() - firstAudioTime : 0;
          console.log(`[TIMING] STT (Deepgram): ${sttMs}ms [final] "${transcript}"`);
          firstAudioTime = null; // reset for next utterance
          onTranscript(transcript, language, sttMs, speechFinal);
        }
      }
    } catch (e) {
      // ignore parse errors on non-JSON frames
    }
  });

  dgWs.on('error', (err) => {
    console.error('[Deepgram] WebSocket error:', err.message);
    if (!connected) onError(err);
  });

  dgWs.on('close', () => {
    console.log('[Deepgram] WebSocket closed');
  });

  return {
    send(audioBuffer) {
      if (!firstAudioTime) firstAudioTime = Date.now();
      if (dgWs.readyState === WS.OPEN) {
        dgWs.send(audioBuffer);
      }
    },
    close() {
      if (dgWs.readyState === WS.OPEN || dgWs.readyState === WS.CONNECTING) {
        try { dgWs.close(); } catch (_) {}
      }
    },
    get connected() { return connected; },
  };
}

wss.on('connection', (ws, req) => {
  console.log('Vobiz connected - BCON');

  let callUUID = null;
  let isProcessing = false;
  let isSpeaking = false;
  let aiFailures = 0;
  let conversationHistory = [];
  let callStartTime = null;

  // Deepgram streaming STT state
  let dgStream = null;
  let useSarvamFallback = false;
  let sarvamAudioBuffer = [];
  let sarvamSilenceTimer = null;

  // Accumulate final transcript segments between speech_final events
  let pendingTranscript = '';
  let pendingLanguage = 'en';
  let pendingStartTime = null;

  /**
   * Process a complete utterance (transcript ready → Claude → TTS → send)
   */
  async function processUtterance(transcript, detectedLanguage, sttMs) {
    if (isProcessing) return;
    if (!transcript || !transcript.trim() || transcript.trim().length < 2) {
      console.log('Empty/short transcript, skipping');
      return;
    }
    isProcessing = true;

    try {
      const pipelineStart = Date.now() - sttMs; // account for STT time already elapsed

      console.log(`Transcript: "${transcript}" [lang: ${detectedLanguage}]`);

      const claudeStart = Date.now();
      const response = await getAIResponse(transcript, conversationHistory, detectedLanguage, ws.leadContext);
      const claudeMs = Date.now() - claudeStart;
      console.log(`AI Response: "${response}"`);

      // Log both messages to Supabase
      if (ws.leadId) {
        try {
          await supabase.from('conversations').insert({
            lead_id: ws.leadId,
            channel: 'voice',
            sender: 'customer',
            content: transcript,
            message_type: 'text',
            metadata: { language: detectedLanguage, call_uuid: callUUID, stt_provider: useSarvamFallback ? 'sarvam' : 'deepgram' },
            created_at: new Date().toISOString(),
          });
          if (response) {
            await supabase.from('conversations').insert({
              lead_id: ws.leadId,
              channel: 'voice',
              sender: 'agent',
              content: response,
              message_type: 'text',
              metadata: { call_uuid: callUUID },
              created_at: new Date().toISOString(),
            });
          }
          console.log('Saved to DB: customer +', transcript.substring(0, 30), '| agent +', (response || '').substring(0, 30));
        } catch (dbErr) {
          console.error('Supabase conversation error:', dbErr.message);
        }
      }

      const safeResponse = (response && response !== 'null' && response.trim()) ? response : null;

      if (safeResponse === null) {
        aiFailures++;
        console.log('AI failure count:', aiFailures);
        if (aiFailures >= 2) {
          isSpeaking = true;
          await speakToVobiz(ws, "Apologies for the inconvenience. Let me connect you with our team. We will call you back within the next few minutes. Thank you for reaching out to Bee-Con Club.", detectedLanguage || 'en-IN');
          isSpeaking = false;
          const totalMs = Date.now() - pipelineStart;
          console.log(`[TIMING] STT: ${sttMs}ms, Claude: ${claudeMs}ms, TTS+Send: ${totalMs - sttMs - claudeMs}ms, Total: ${totalMs}ms (fallback)`);
          ws.close();
          return;
        }
        isSpeaking = true;
        await speakToVobiz(ws, "Sorry, I'm having a bit of trouble. Want me to get someone from the team to call you back?", detectedLanguage || 'en-IN');
        isSpeaking = false;
        const totalMs = Date.now() - pipelineStart;
        console.log(`[TIMING] STT: ${sttMs}ms, Claude: ${claudeMs}ms, TTS+Send: ${totalMs - sttMs - claudeMs}ms, Total: ${totalMs}ms (AI fail)`);
      } else {
        aiFailures = 0;
        isSpeaking = true;
        const ttsStart = Date.now();
        await speakToVobiz(ws, safeResponse, detectedLanguage || 'en-IN');
        isSpeaking = false;
        const ttsSendMs = Date.now() - ttsStart;
        const totalMs = Date.now() - pipelineStart;
        console.log(`[TIMING] STT: ${sttMs}ms, Claude: ${claudeMs}ms, TTS+Send: ${ttsSendMs}ms, Total: ${totalMs}ms`);
      }
    } catch (err) {
      console.error('Processing error:', err.message);
    } finally {
      isProcessing = false;
    }
  }

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        callUUID = msg.start?.callId || msg.callId || 'unknown';
        ws.callStartTime = Date.now();
        callStartTime = new Date();
        const streamId = msg.start?.streamId || null;
        ws.streamId = streamId;
        console.log(`Call started: ${callUUID}, streamId: ${streamId}`);
        console.log('Media format:', JSON.stringify(msg.start?.mediaFormat));
        console.log('Vobiz start event keys:', JSON.stringify(msg.start));
        console.log('Vobiz extra_headers:', JSON.stringify(msg.extra_headers));

        // Extract caller phone from extra_headers (Vobiz sends "{X-PH-callerPhone: 919353253817, ...}")
        console.log('extra_headers typeof:', typeof msg.extra_headers);
        const extraHeaders = msg.extra_headers ? (typeof msg.extra_headers === 'string' ? msg.extra_headers : JSON.stringify(msg.extra_headers)) : '';
        const phoneMatch = extraHeaders.match(/callerPhone[:\s]+(\d+)/);
        const callerPhone = phoneMatch ? phoneMatch[1] : null;
        const normalizedPhone = callerPhone ? (callerPhone.length === 12 && callerPhone.startsWith('91') ? callerPhone.slice(2) : callerPhone) : null;
        ws.callerPhone = callerPhone;
        ws.normalizedPhone = normalizedPhone;
        console.log('Caller phone:', callerPhone, '-> normalized:', normalizedPhone);

        // Create lead and voice session in Supabase
        if (normalizedPhone) {
          try {
            const { data: existingLeads } = await supabase
              .from('all_leads')
              .select('id, first_touchpoint, brand')
              .eq('customer_phone_normalized', normalizedPhone);

            // Prefer bcon-branded lead, otherwise use first match
            const existingLead = existingLeads?.find(l => l.brand === 'bcon') || existingLeads?.[0] || null;

            let leadId;
            if (existingLead) {
              leadId = existingLead.id;
              const updates = { last_touchpoint: 'voice', last_interaction_at: new Date().toISOString() };
              if (existingLead.brand === 'default') updates.brand = 'bcon';
              await supabase
                .from('all_leads')
                .update(updates)
                .eq('id', leadId);
              console.log('Updated existing lead:', leadId, 'brand:', existingLead.brand);
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
                  lead_stage: 'New',
                })
                .select('id')
                .single();
              leadId = newLead?.id;
              console.log('Created new lead:', leadId);
            }

            ws.leadId = leadId;

            // Create voice session
            if (leadId) {
              const { data: sessData, error: sessErr } = await supabase
                .from('voice_sessions')
                .insert({
                  lead_id: leadId,
                  external_session_id: callUUID,
                  customer_phone: callerPhone,
                  customer_phone_normalized: normalizedPhone,
                  call_status: 'in-progress',
                  call_direction: 'inbound',
                  brand: 'bcon',
                  created_at: new Date().toISOString(),
                })
                .select('id')
                .single();
              if (sessErr) console.error('Voice session insert error:', sessErr.message);
              else {
                ws.voiceSessionId = sessData?.id;
                console.log('Voice session created for call:', callUUID, 'sessionId:', ws.voiceSessionId);
              }
            }
          } catch (dbErr) {
            console.error('Supabase start error:', dbErr.message);
          }
        }

        // Send cached greeting instantly - context loads in background after
        if (greetingAudioChunks && ws.readyState === 1) {
          isSpeaking = true;
          await sendChunkedAudio(ws, greetingAudioChunks);
          isSpeaking = false;
          console.log('Greeting sent from cache');
        } else {
          console.log('No cached greeting, generating...');
          await speakToVobiz(ws, "Hi there! Thank you for calling Bee-Con Club. I'm Prox-ee How can I help you today?", 'en-IN');
        }

        // Open Deepgram streaming STT (or fall back to Sarvam)
        dgStream = openDeepgramStream(
          // onTranscript callback: called for each is_final segment
          (transcript, language, sttMs, speechFinal) => {
            // Accumulate segments until speech_final (end of utterance)
            if (!pendingStartTime) pendingStartTime = Date.now() - sttMs;
            pendingTranscript += (pendingTranscript ? ' ' : '') + transcript;
            pendingLanguage = language;

            if (speechFinal) {
              // Full utterance complete - process it
              const fullTranscript = pendingTranscript.trim();
              const totalSttMs = pendingStartTime ? Date.now() - pendingStartTime : sttMs;
              pendingTranscript = '';
              pendingStartTime = null;
              // Map Deepgram language codes to Sarvam TTS format
              const ttsLang = pendingLanguage.startsWith('hi') ? 'hi-IN' : 'en-IN';
              processUtterance(fullTranscript, ttsLang, totalSttMs);
            }
          },
          // onError callback: Deepgram failed to connect, fall back to Sarvam
          (err) => {
            console.warn('[Deepgram] Connection failed, falling back to Sarvam STT:', err.message);
            useSarvamFallback = true;
            dgStream = null;
          }
        );

        // Load lead context in background (non-blocking, ready before first real response)
        if (ws.leadId) {
          loadLeadContext(ws.leadId).then(ctx => {
            ws.leadContext = ctx;
            console.log('Lead context loaded:', ctx.name, 'stage:', ctx.stage);
          }).catch(err => {
            console.error('Lead context fetch failed (continuing without):', err.message);
          });
        }
      }

      if (msg.event === 'media' && msg.media?.payload) {
        // Skip processing inbound audio while we're speaking (prevents echo)
        if (isSpeaking) return;

        const chunk = Buffer.from(msg.media.payload, 'base64');

        // ── Deepgram streaming path: pipe raw audio directly ──
        if (dgStream && dgStream.connected && !useSarvamFallback) {
          dgStream.send(chunk);
          return;
        }

        // ── Sarvam fallback path: buffer + silence detection (original behavior) ──
        const energy = chunk.reduce((sum, b) => {
          const distFrom7F = Math.abs(b - 0x7F);
          const distFromFF = Math.abs(b - 0xFF);
          return sum + Math.min(distFrom7F, distFromFF);
        }, 0) / chunk.length;
        const isSilence = energy < 5;

        if (!isSilence) {
          sarvamAudioBuffer.push(chunk);
          clearTimeout(sarvamSilenceTimer);
          sarvamSilenceTimer = null;
        }

        if (!isProcessing && sarvamAudioBuffer.length > 0 && !sarvamSilenceTimer) {
          sarvamSilenceTimer = setTimeout(async () => {
            sarvamSilenceTimer = null;
            if (sarvamAudioBuffer.length > 5) {
              const audio = Buffer.concat(sarvamAudioBuffer);
              sarvamAudioBuffer = [];

              const { transcript, language: detectedLanguage, _sttMs } = await sarvamSTT(audio);
              processUtterance(transcript, detectedLanguage, _sttMs || 0);
            }
          }, 300);
        }
      }

      if (msg.event === 'stop') {
        console.log(`Call ended: ${callUUID}`);
        clearTimeout(sarvamSilenceTimer);
        if (dgStream) dgStream.close();

        // Process any remaining pending Deepgram transcript
        if (pendingTranscript.trim()) {
          const totalSttMs = pendingStartTime ? Date.now() - pendingStartTime : 0;
          const ttsLang = pendingLanguage.startsWith('hi') ? 'hi-IN' : 'en-IN';
          await processUtterance(pendingTranscript.trim(), ttsLang, totalSttMs);
          pendingTranscript = '';
          pendingStartTime = null;
        }

        // Update voice session with duration
        if (callUUID && ws.callStartTime) {
          try {
            const durationSecs = Math.floor((Date.now() - ws.callStartTime) / 1000);
            await supabase
              .from('voice_sessions')
              .update({ call_status: 'completed', call_duration_seconds: durationSecs, updated_at: new Date().toISOString() })
              .eq('external_session_id', callUUID);
            console.log('Call ended, duration:', durationSecs, 'seconds');
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
    clearTimeout(sarvamSilenceTimer);
    if (dgStream) dgStream.close();
    console.log(`Disconnected: ${callUUID}`);

    // Fallback: update voice session if stop event was missed
    if (callUUID && ws.callStartTime) {
      try {
        const durationSecs = Math.floor((Date.now() - ws.callStartTime) / 1000);
        await supabase
          .from('voice_sessions')
          .update({ call_status: 'completed', call_duration_seconds: durationSecs, updated_at: new Date().toISOString() })
          .eq('external_session_id', callUUID)
          .eq('call_status', 'in-progress');
        console.log('Call ended, duration:', durationSecs, 'seconds');
      } catch (dbErr) {
        console.error('Supabase close error:', dbErr.message);
      }
    }
  });
});

async function sarvamSTT(audioBuffer) {
  const sttStart = Date.now();
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
        timeout: 2000,
      }
    );
    const sttMs = Date.now() - sttStart;
    console.log(`[TIMING] STT sent → received: ${sttMs}ms`);
    return {
      transcript: response.data?.transcript || '',
      language: response.data?.language_code || 'hi-IN',
      _sttMs: sttMs,
    };
  } catch (err) {
    const sttMs = Date.now() - sttStart;
    console.error(`STT error (${sttMs}ms):`, err.response?.data || err.message);
    return { transcript: '', language: 'hi-IN', _sttMs: sttMs };
  }
}

async function sarvamTTS(text, language = 'en-IN') {
  const ttsStart = Date.now();
  try {
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        inputs: [text],
        target_language_code: language,
        speaker: 'shubh',
        model: 'bulbul:v3',
        encoding: 'pcm',
        sample_rate: 16000,
      },
      {
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    const ttsMs = Date.now() - ttsStart;
    const audio = response.data?.audios?.[0] || null;
    console.log(`[TIMING] TTS sent → received: ${ttsMs}ms (audio length: ${audio?.length || 0})`);
    return audio;
  } catch (err) {
    const ttsMs = Date.now() - ttsStart;
    console.error(`TTS error (${ttsMs}ms):`, err.response?.data || err.message);
    return null;
  }
}

async function speakToVobiz(ws, text, language = 'en-IN') {
  const ttsCallStart = Date.now();
  const audio = await sarvamTTS(text, language);
  if (audio && ws.readyState === 1) {
    const resampleStart = Date.now();
    const chunks = prepareAudioChunks(audio);
    const resampleMs = Date.now() - resampleStart;
    console.log(`[TIMING] Resample + chunk: ${resampleMs}ms (${chunks.length} chunks)`);
    const firstChunkTime = Date.now();
    await sendChunkedAudio(ws, chunks);
    console.log(`[TIMING] First audio chunk sent at: +${firstChunkTime - ttsCallStart}ms after TTS request`);
  } else {
    console.log('Audio not sent - null or ws closed');
  }
}

const SYSTEM_PROMPT = `You are Prox-ee, a voice assistant at Bee-Con Club. You talk like a real person on a phone call, not like a scripted bot. How you speak: Short. Casual. Like texting but spoken. Never say "How can I help you today" or "Is there anything else I can help with" or any customer service phrases. Just talk normally. If someone says hi, say hi back. If they ask your name, just say it. Do not over-explain. Do not add filler questions after every answer. Examples of how you talk: "Hey, yeah I'm Prox-ee, the A.I. assistant here at Bee-Con." "We do A.I. agents for businesses, basically automates your sales and follow-ups." "What's your business about?" "Cool, yeah we can definitely help with that." "Want me to get someone from the team to call you back?" What you know about Bee-Con Club: We are a Human times A.I. business solutions company. Not a dev shop, not an agency. We build intelligent business systems with A.I. at the core. We have three pillars. First, A.I. in Business. This includes A.I. Lead Machine for lead generation and quality, A.I. chatbots and customer support agents, A.I. workflow automation, A.I. analytics and dashboards, A.I. content generation, and custom A.I. solutions built for specific business needs. Second, Brand Marketing. Full service strategy, creative, execution, and optimization. Marketing that thinks, adapts, and performs. Third, Business Apps. Web apps, mobile apps, SaaS products with A.I. embedded. We also built Prox-ee, an A.I. powered operating system for growing businesses. We work with real estate, education, fitness, travel, consulting, aviation, retail, media, and more. Never say we only do one thing. We cover A.I. systems, marketing, and apps. If someone asks about social media, yes we do brand marketing including social. If someone asks about ads, yes we do A.I. Lead Machine which handles ad strategy and optimization. If asked about pricing, say it depends on scope and the team will map it out on a call. Never give specific prices. Rules: Respond in whatever language the caller is speaking. Match their language exactly. Keep responses under 12 words unless explaining something specific. No markdown. No lists. No emojis. Never repeat what the caller said. One thought per response. If you dont understand, just say "Sorry, didn't catch that, one more time?"`;

async function loadLeadContext(leadId) {
  const ctx = { name: null, stage: null, score: null, previousMessages: [], channels: [], adminNotes: [], unifiedContext: null };

  try {
    const { data: lead } = await supabase
      .from('all_leads')
      .select('customer_name, email, phone, first_touchpoint, last_touchpoint, lead_stage, lead_score, unified_context')
      .eq('id', leadId)
      .maybeSingle();

    if (lead) {
      ctx.name = lead.customer_name || null;
      ctx.stage = lead.lead_stage || null;
      ctx.score = lead.lead_score || null;
      // Collect unique channels from touchpoints and unified_context keys
      const touchpoints = new Set([lead.first_touchpoint, lead.last_touchpoint].filter(Boolean));
      if (lead.unified_context) {
        Object.keys(lead.unified_context).forEach(k => touchpoints.add(k));
      }
      ctx.channels = Array.from(touchpoints);
      if (lead.unified_context) {
        ctx.unifiedContext = typeof lead.unified_context === 'string' ? lead.unified_context : JSON.stringify(lead.unified_context);
      }
    }
  } catch (err) {
    console.error('Lead context query error:', err.message);
  }

  try {
    const { data: messages } = await supabase
      .from('conversations')
      .select('sender, content, channel, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (messages && messages.length > 0) {
      ctx.previousMessages = messages.reverse().map(m => ({
        sender: m.sender,
        content: (m.content || '').substring(0, 100),
        channel: m.channel
      }));
    }
  } catch (err) {
    console.error('Lead messages query error:', err.message);
  }

  try {
    const { data: notes } = await supabase
      .from('lead_activities')
      .select('note, created_at')
      .eq('lead_id', leadId)
      .eq('activity_type', 'note')
      .order('created_at', { ascending: false })
      .limit(5);

    if (notes && notes.length > 0) {
      ctx.adminNotes = notes.map(n => n.note);
    }
  } catch (err) {
    console.error('Lead admin notes query error:', err.message);
  }

  return ctx;
}

async function getAIResponse(transcript, conversationHistory, detectedLanguage, leadContext) {
  const claudeStart = Date.now();
  try {
    conversationHistory.push({ role: 'user', content: '[Caller language: ' + detectedLanguage + '] ' + transcript });

    // Build dynamic system prompt with lead context
    let dynamicPrompt = SYSTEM_PROMPT;
    if (leadContext) {
      if (leadContext.name && leadContext.name !== 'Unknown') {
        dynamicPrompt += ` The caller's name is ${leadContext.name}. Use their name naturally in conversation, like greeting them by name.`;
      }
      if (leadContext.unifiedContext) {
        dynamicPrompt += ` Previous conversation summary: ${leadContext.unifiedContext}`;
      }
      if (leadContext.previousMessages && leadContext.previousMessages.length > 0) {
        const recent = leadContext.previousMessages.slice(-5).map(m => `${m.sender}: ${m.content}`).join(' | ');
        dynamicPrompt += ` This is a returning caller. Recent messages: ${recent}. Reference past interactions naturally if relevant, like "Last time we talked about X".`;
      }
      if (leadContext.stage) {
        dynamicPrompt += ` This lead is currently at stage: ${leadContext.stage}. Adjust your approach accordingly.`;
      }
      if (leadContext.adminNotes && leadContext.adminNotes.length > 0) {
        dynamicPrompt += ` Team notes: ${leadContext.adminNotes.join(' | ')}`;
      }
      if (leadContext.channels && leadContext.channels.length > 1) {
        dynamicPrompt += ` This person has also contacted us via ${leadContext.channels.join(', ')}. They are an active lead.`;
      }
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: dynamicPrompt,
        messages: conversationHistory,
      },
      {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    const claudeMs = Date.now() - claudeStart;
    const aiText = response.data?.content?.[0]?.text?.trim() || null;
    if (aiText) {
      conversationHistory.push({ role: 'assistant', content: aiText });
    }
    console.log(`[TIMING] Claude sent → received: ${claudeMs}ms`);
    console.log('AI response:', aiText);
    return aiText;
  } catch (err) {
    const claudeMs = Date.now() - claudeStart;
    console.error(`Claude error (${claudeMs}ms):`, err.response?.status, JSON.stringify(err.response?.data || err.message));
    return null;
  }
}

const PORT = process.env.PORT || 3006;
server.listen(PORT, async () => {
  console.log(`BCON Voice server running on port ${PORT}`);
  await preloadGreeting();
});
