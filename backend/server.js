require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws')(express());
const app = expressWs.app;
const WebSocket = require('ws');
const twilio = require('twilio');
const fetch = require('node-fetch');

app.use(express.json());

const PORT = process.env.PORT || 3000;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.FROM_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID;

// TwiML for incoming calls (uses default agent)
app.get('/twiml/incoming', (req, res) => {
  const agentId = DEFAULT_AGENT_ID;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${SERVER_URL}/media-stream?agentId=${agentId}" />
  </Connect>
</Response>`;
  res.type('text/xml').send(twiml);
});

// Trigger outgoing call
app.post('/start-outgoing', async (req, res) => {
  const { phoneNumber, agentId } = req.body;
  if (!phoneNumber || !agentId) return res.status(400).send({ error: 'Missing parameters' });

  const client = twilio(TWILIO_SID, TWILIO_TOKEN);
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${SERVER_URL}/media-stream?agentId=${agentId}" />
  </Connect>
</Response>`;

  try {
    const call = await client.calls.create({
      to: phoneNumber,
      from: FROM_NUMBER,
      twiml,
    });
    res.send({ success: true, callSid: call.sid });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// WebSocket for media stream
app.ws('/media-stream', (ws, req) => {
  const agentId = req.query.agentId;
  let streamSid;
  let elevenWs;

  // Get signed URL for ElevenLabs WebSocket
  const getSignedUrl = async () => {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
      method: 'GET',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });
    if (!response.ok) throw new Error('Failed to get signed URL');
    const { signed_url } = await response.json();
    return signed_url;
  };

  // Setup ElevenLabs WebSocket
  const setupElevenWs = async () => {
    try {
      const signedUrl = await getSignedUrl();
      elevenWs = new WebSocket(signedUrl);

      elevenWs.on('open', () => {
        console.log('ElevenLabs WS connected');
      });

      elevenWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        switch (msg.type) {
          case 'audio':
            const payload = msg.audio_event.audio_base_64;
            ws.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: { payload },
            }));
            break;
          case 'ping':
            elevenWs.send(JSON.stringify({
              type: 'pong',
              event_id: msg.ping_event.event_id,
            }));
            break;
          case 'interruption':
            ws.send(JSON.stringify({
              event: 'clear',
              streamSid,
            }));
            break;
          default:
            console.log('Unhandled ElevenLabs event:', msg.type);
        }
      });

      elevenWs.on('close', () => ws.close());
      elevenWs.on('error', (err) => {
        console.error('ElevenLabs WS error:', err);
        ws.close();
      });
    } catch (err) {
      console.error('Setup error:', err);
      ws.close();
    }
  };

  setupElevenWs();

  ws.on('message', (message) => {
    const msg = JSON.parse(message.toString());
    switch (msg.event) {
      case 'start':
        streamSid = msg.start.streamSid;
        console.log('Twilio stream started:', streamSid);
        break;
      case 'media':
        if (elevenWs && elevenWs.readyState === WebSocket.OPEN) {
          const audioChunk = msg.media.payload;
          elevenWs.send(JSON.stringify({ user_audio_chunk: audioChunk }));
        }
        break;
      case 'stop':
        if (elevenWs) elevenWs.close();
        console.log('Twilio stream stopped');
        break;
      default:
        console.log('Unhandled Twilio event:', msg.event);
    }
  });

  ws.on('close', () => {
    if (elevenWs) elevenWs.close();
    console.log('Twilio WS closed');
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
