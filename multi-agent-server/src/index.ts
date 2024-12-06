import express from 'express';
import cors from 'cors';
import { AgentManager } from './manager';
import { AgentConfig } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize agent manager
const agentManager = new AgentManager();
agentManager.initialize();

const AGENT_SERVER_PORT = 3000;
const EXPRESS_SERVER_PORT = 8000;

// Notes:
// 1) If you start this server with no agents it will trigger the default charecter to load.
//    This is fine but was confusing the first time I saw it.
//
// 2) The agentId and userId seem to be being set automatically with the caht endpoint.
//    These are not the same as the values in the body of your post request
//
// 3) The logs suggest that chat messages are received by the agent server
//    but it is not clear that they are being understood as I don't see any response generated.
//    Its also not clear that the endpoint I am hitting is expected to return a message in the response.
//
// 4) The default port for the agents to run on is 3000 but the default for AgentRuntime.serverUrl = "http://localhost:7998"
//    AgentRuntime.serverUrl is the base URL of the server where the agent's requests are processed.
//    Should I be sending my chat requests there?

app.post('/agents', async (req, res) => {
    try {
        const { id, config } = req.body;
        !config.name && res.status(400).json({ error: 'Agent must have a name' });

        // TODO: actually validate config is of type AgentConfig
        const result = await agentManager.createAgent(id, config as AgentConfig);
        res.json(result);
    } catch (err: unknown) {
        if (err instanceof Error) {
            res.status(400).json({ error: err.message });
        } else {
            res.status(400).json({ error: 'An unknown error occurred' });
        }
    }
});

app.post('/chat', async (req, res) => {
    try {
      const { message, agentId, userId, userName } = req.body;

      const response = await fetch(`http://localhost:${AGENT_SERVER_PORT}/${agentId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          userId,
          userName
        })
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
});

app.put('/agents/:id', async (req, res) => {
    // try {
    //     const result = await agentManager.updateAgent(req.params.id, req.body);
    //     res.json(result);
    // } catch (err: unknown) {
    //     if (err instanceof Error) {
    //     res.status(400).json({ error: err.message });
    //     } else {
    //     res.status(400).json({ error: 'An unknown error occurred' });
    //     }
    // }
});

app.delete('/agents/:id', async (req, res) => {
    // try {
    //     const result = await agentManager.deleteAgent(req.params.id);
    //     res.json(result);
    // } catch (err: unknown) {
    //     if (err instanceof Error) {
    //     res.status(400).json({ error: err.message });
    //     } else {
    //     res.status(400).json({ error: 'An unknown error occurred' });
    //     }
    // }
});

app.get('/agents/:id', async (req, res) => {
    // try {
    //     const config = await agentManager.getAgent(req.params.id);
    //     res.json(config);
    // } catch (err: unknown) {
    //     if (err instanceof Error) {
    //     res.status(404).json({ error: err.message });
    //     } else {
    //     res.status(404).json({ error: 'Agent not found' });
    //     }
    // }
});

app.listen(EXPRESS_SERVER_PORT, () => {
    console.log(`Express server running on port ${EXPRESS_SERVER_PORT}`);
  });
