const isTestMode = process.env.TEST_MODE === 'true';

module.exports = {
  apps: [
    // NOTE: bcon-voice (server.js — the old ElevenLabs/Deepgram WebSocket voice
    // server) was retired when voice moved to Vapi (see api/agent/voice/answer).
    // Removed from PM2 so a redeploy can't resurrect the dead process.
    {
      name: 'bcon-tasks',
      script: 'task-worker.js',
      cron_restart: isTestMode ? '*/1 * * * *' : '*/5 * * * *',
      autorestart: false,
      env_file: '.env',
      env: { NODE_ENV: 'production' }
    }
  ]
};
