import React, { useState } from 'react';

function App() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState('');

  // Example agents (add your ElevenLabs agent IDs here)
  const agents = [
    { id: 'agent1_id', name: 'Support Agent' },
    { id: 'agent2_id', name: 'Sales Agent' },
  ];

  const startCall = async () => {
    try {
      const response = await fetch('https://your-server-url/start-outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, agentId }),
      });
      const data = await response.json();
      setStatus(data.success ? `Call started (SID: ${data.callSid})` : `Error: ${data.error}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>AI Voice Agent App</h1>
      <label>Phone Number:</label>
      <input
        type="text"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+1234567890"
      />
      <br />
      <label>Select Agent:</label>
      <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
        <option value="">Choose...</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <br />
      <button onClick={startCall}>Start Outgoing Call</button>
      <p>Status: {status}</p>
      <p>For incoming calls, dial your Twilio number to connect with the default agent.</p>
    </div>
  );
}

export default App;
