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
  const raw = await elevenLabsTTS("Hi there! Thank you for calling Bee-Con Club. I'm Prox-ee How can I help you today?");
  if (raw) {
    greetingAudioChunks = preparePcmChunks(raw);
    console.log('Greeting audio ready, chunks:', greetingAudioChunks.length);
  }
}

// Break raw pcm_16000 buffer into 300ms chunks (16kHz, 16-bit, mono = 9600 bytes/chunk)
function preparePcmChunks(buffer) {
  const CHUNK_SIZE = 9600; // 300ms at 16kHz, 16-bit mono
  const chunks = [];
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    chunks.push(buffer.slice(i, i + CHUNK_SIZE).toString('base64'));
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
  let firstAudioTime = null;    // when first audio chunk of this utterance was sent
  let lastAudioSentTime = null; // when the most recent audio chunk was sent (for processing latency)

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
          const speakingMs = firstAudioTime ? Date.now() - firstAudioTime : 0;
          const processingMs = lastAudioSentTime ? Date.now() - lastAudioSentTime : 0;
          console.log(`[TIMING] STT (Deepgram): speaking=${speakingMs}ms, processing=${processingMs}ms [final] "${transcript}"`);
          firstAudioTime = null;
          lastAudioSentTime = null;
          onTranscript(transcript, language, processingMs, speechFinal);
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
      lastAudioSentTime = Date.now();
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

      // Save customer message to DB immediately (don't wait for AI response)
      if (ws.leadId) {
        supabase.from('conversations').insert({
          lead_id: ws.leadId,
          channel: 'voice',
          sender: 'customer',
          content: transcript,
          message_type: 'text',
          metadata: { language: detectedLanguage, call_uuid: callUUID, stt_provider: useSarvamFallback ? 'sarvam' : 'deepgram' },
          created_at: new Date().toISOString(),
        }).then(null, dbErr => console.error('Supabase customer msg error:', dbErr.message));
      }

      const claudeStart = Date.now();
      isSpeaking = true;
      // streamAndSpeak: streams Claude response and pipes each sentence to TTS+Vobiz immediately
      const response = await streamAndSpeak(transcript, conversationHistory, detectedLanguage, ws.leadContext, ws);
      const claudeAndTtsMs = Date.now() - claudeStart;
      console.log(`AI Response: "${response}"`);

      // Save agent response to DB after streaming completes
      if (ws.leadId && response) {
        supabase.from('conversations').insert({
          lead_id: ws.leadId,
          channel: 'voice',
          sender: 'agent',
          content: response,
          message_type: 'text',
          metadata: { call_uuid: callUUID },
          created_at: new Date().toISOString(),
        }).then(null, dbErr => console.error('Supabase agent msg error:', dbErr.message));
      }

      const safeResponse = (response && response !== 'null' && response.trim()) ? response : null;

      if (safeResponse === null) {
        aiFailures++;
        console.log('AI failure count:', aiFailures);
        if (aiFailures >= 2) {
          await speakToVobiz(ws, "Apologies for the inconvenience. Let me connect you with our team. We will call you back within the next few minutes. Thank you for reaching out to Bee-Con Club.", detectedLanguage || 'en-IN');
          isSpeaking = false;
          const totalMs = Date.now() - pipelineStart;
          console.log(`[TIMING] STT: ${sttMs}ms, Claude+TTS: ${claudeAndTtsMs}ms, Total: ${totalMs}ms (fallback)`);
          ws.close();
          return;
        }
        await speakToVobiz(ws, "Sorry, I'm having a bit of trouble. Want me to get someone from the team to call you back?", detectedLanguage || 'en-IN');
        const totalMs = Date.now() - pipelineStart;
        console.log(`[TIMING] STT: ${sttMs}ms, Claude+TTS: ${claudeAndTtsMs}ms, Total: ${totalMs}ms (AI fail)`);
      } else {
        aiFailures = 0;
        const totalMs = Date.now() - pipelineStart;
        console.log(`[TIMING] STT: ${sttMs}ms, Claude+TTS (streaming): ${claudeAndTtsMs}ms, Total: ${totalMs}ms`);
      }
      isSpeaking = false;
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

        // Detect outbound call direction and lead name from extraHeaders
        const directionMatch = extraHeaders.match(/direction[=:\s]+(\w+)/);
        const leadNameMatch = extraHeaders.match(/leadName[=:\s]+([^,}]+)/);
        ws.callDirection = directionMatch ? directionMatch[1] : 'inbound';
        ws.outboundLeadName = leadNameMatch ? decodeURIComponent(leadNameMatch[1].trim()) : null;
        console.log('Call direction:', ws.callDirection, 'Lead name:', ws.outboundLeadName);

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
                  call_direction: ws.callDirection || 'inbound',
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

        // Send greeting — outbound uses a personalised opener, inbound uses cached audio
        if (ws.callDirection === 'outbound') {
          const name = ws.outboundLeadName && ws.outboundLeadName !== 'null' ? ws.outboundLeadName : null;
          const greeting = name
            ? `Hey ${name}, this is Prox-ee calling from Bee-Con Club. You had reached out to us earlier — just wanted to follow up. Is this a good time to talk?`
            : `Hey, this is Prox-ee calling from Bee-Con Club. You had reached out to us earlier — just wanted to follow up. Is this a good time?`;
          isSpeaking = true;
          await speakToVobiz(ws, greeting, 'en-IN');
          isSpeaking = false;
          console.log('Outbound greeting sent');
        } else if (greetingAudioChunks && ws.readyState === 1) {
          isSpeaking = true;
          await sendChunkedAudio(ws, greetingAudioChunks);
          isSpeaking = false;
          console.log('Greeting sent from cache');
        } else {
          console.log('No cached greeting, generating...');
          await speakToVobiz(ws, "Hi there! Thank you for calling Bee-Con Club. I'm Prox-ee. How can I help you today?", 'en-IN');
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

async function elevenLabsTTS(text) {
  const ttsStart = Date.now();
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TTS ERROR] ElevenLabs ${res.status}: ${errText}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const ttsMs = Date.now() - ttsStart;
    console.log(`[TIMING] TTS sent → received: ${ttsMs}ms (audio bytes: ${buffer.length})`);
    return buffer;
  } catch (err) {
    const ttsMs = Date.now() - ttsStart;
    console.error(`[TTS ERROR] (${ttsMs}ms): ${err.message}`);
    return null;
  }
}

async function speakToVobiz(ws, text, language = 'en-IN') {
  const ttsCallStart = Date.now();
  if (!text || !text.trim()) {
    console.log('[Speak] Empty text received, skipping TTS');
    return;
  }

  const audio = await elevenLabsTTS(text);

  if (audio && ws.readyState === 1) {
    const chunks = preparePcmChunks(audio);
    if (chunks.length > 0) {
      const firstChunkTime = Date.now();
      await sendChunkedAudio(ws, chunks);
      console.log(`[TIMING] First audio chunk sent at: +${firstChunkTime - ttsCallStart}ms after TTS request`);
    } else {
      console.log('[Speak] No audio chunks generated from TTS response');
    }
  } else {
    if (ws.readyState !== 1) {
      console.log('[Speak] WebSocket closed, audio not sent');
    } else if (!audio) {
      console.warn('[Speak] TTS failed to generate audio (null response)');
    }
  }
}

const SYSTEM_PROMPT = `You are Prox-ee (pronounced PROXY), a voice AI for BCON Club (pronounced BEE-kun Club). Talk like a real person on a call — natural, confident, no corporate speak.

Your goal every call: understand their business and move them toward booking a discovery call with the Bee-Con team.

ABOUT BEE-CON CLUB:
We help businesses integrate AI and maximise their potential. Three areas: AI in Business (custom AI agents, lead automation, workflow automation, analytics), Brand Marketing (strategy to execution, AI-powered), and Business Apps (web apps, mobile apps, custom SaaS). We work with real estate, education, fitness, travel, consulting, aviation, retail.

WHEN ASKED ABOUT SERVICES — answer then probe immediately:
Example: "We help businesses integrate AI and maximise their potential — from automating lead follow-ups to building custom AI agents for your ops. What kind of business are you running?"
Example: "We do three things: AI systems, brand marketing, and business apps, all built around your specific needs. What are you trying to set up?"

CONVERSATION FLOW — ALWAYS KEEP IT MOVING:
1. After greeting, ask what their business does.
2. Dig deeper — "What are you trying to build or set up?" or "Where do you see the gap in your business right now?"
3. Connect their pain to what Bee-Con does specifically for them.
4. Push for the call: "Want me to have someone from the team map out what that looks like for you?"

CRITICAL: Never give a one-liner and go quiet. Always follow an answer with a question or a push.

Pricing: "Depends on the scope — the team maps that out on a discovery call. Worth 15 minutes."
Missed something: "Sorry, say that again?"

Rules: Match caller energy. Keep responses to 2-4 sentences. No markdown. No lists. No emojis. Never repeat what caller said.`;

const OUTBOUND_SYSTEM_PROMPT = `You are Prox-ee (pronounced PROXY), a voice AI for BCON Club (pronounced BEE-kun Club). You are making an OUTBOUND follow-up call to someone who previously reached out to BCON Club.

Tone: Warm, natural, friendly — like a human follow-up call. Not salesy. Genuine.

Your goal: Remind them why they reached out, understand where they're at now, and move toward booking a discovery call with the Bee-Con team.

OPENING IS ALREADY DONE — do not re-introduce yourself. The caller has already heard the greeting. Jump straight into the conversation from their first response.

CONVERSATION FLOW:
1. If they say "yes it's a good time" — ask what they were looking into when they reached out.
2. Understand where they're at now — has anything changed? Are they still looking?
3. Connect their need to what Bee-Con can do for them specifically.
4. Push for the booking: "Want me to set up a quick call with the team to map that out for you?"

ABOUT BEE-CON CLUB:
We help businesses integrate AI and maximise their potential. Three areas: AI in Business (custom AI agents, lead automation, workflow automation, analytics), Brand Marketing (strategy to execution, AI-powered), and Business Apps (web apps, mobile apps, custom SaaS).

If not a good time: "No worries at all — when would be a better time to call back?"
Pricing: "Depends on the scope — the team maps that out on a discovery call. Worth 15 minutes."
Missed something: "Sorry, say that again?"

Rules: Keep responses to 2-3 sentences. No markdown. No lists. No emojis. Always end with a question or a push forward.`;

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

function buildDynamicPrompt(leadContext, callDirection) {
  let dynamicPrompt = callDirection === 'outbound' ? OUTBOUND_SYSTEM_PROMPT : SYSTEM_PROMPT;
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
  return dynamicPrompt;
}

async function streamAndSpeak(transcript, conversationHistory, detectedLanguage, leadContext, ws) {
  const streamStart = Date.now();
  try {
    conversationHistory.push({ role: 'user', content: '[Caller language: ' + detectedLanguage + '] ' + transcript });

    const dynamicPrompt = buildDynamicPrompt(leadContext, ws.callDirection);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        stream: true,
        system: dynamicPrompt,
        messages: conversationHistory,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Claude Stream ERROR] ${res.status}: ${errText}`);
      return null;
    }

    let fullText = '';
    let buffer = '';
    let incomplete = '';
    let firstTokenMs = null;
    let sentenceCount = 0;

    for await (const chunk of res.body) {
      const text = incomplete + Buffer.from(chunk).toString('utf8');
      incomplete = '';
      const lines = text.split('\n');
      incomplete = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const token = event.delta.text;
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - streamStart;
              console.log(`[TIMING] Claude first token: ${firstTokenMs}ms`);
            }
            fullText += token;
            buffer += token;

            // Detect sentence boundary and speak immediately
            const sentenceMatch = buffer.match(/^(.*?[.!?])\s*([\s\S]*)$/);
            if (sentenceMatch && sentenceMatch[1].trim().length > 5) {
              const sentence = sentenceMatch[1].trim();
              buffer = sentenceMatch[2] || '';
              sentenceCount++;
              const sentenceMs = Date.now() - streamStart;
              console.log(`[TIMING] Sentence ${sentenceCount} ready at: ${sentenceMs}ms — "${sentence}"`);
              if (ws.readyState === 1) {
                await speakToVobiz(ws, sentence, detectedLanguage || 'en-IN');
              }
            }
          }
        } catch (_) { /* ignore SSE parse errors */ }
      }
    }

    // Speak any remaining buffer that didn't end with punctuation
    const remaining = buffer.trim();
    if (remaining && remaining.length > 3 && ws.readyState === 1) {
      await speakToVobiz(ws, remaining, detectedLanguage || 'en-IN');
    }

    const totalMs = Date.now() - streamStart;
    console.log(`[TIMING] Claude stream total: ${totalMs}ms`);

    if (fullText) {
      conversationHistory.push({ role: 'assistant', content: fullText });
    }
    return fullText || null;
  } catch (err) {
    const ms = Date.now() - streamStart;
    console.error(`[Claude Stream ERROR] (${ms}ms): ${err.message}`);
    return null;
  }
}


const PORT = process.env.PORT || 3006;
server.listen(PORT, async () => {
  console.log(`BCON Voice server running on port ${PORT}`);
  await preloadGreeting();
});
