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

// API Routes
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

app.listen(8555, () => {
    console.log('Server running on port 8555');
});
