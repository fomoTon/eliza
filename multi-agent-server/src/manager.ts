import { AgentConfig } from "./types";
import { createCharacterConfig } from "./manager.utils"
import { spawn, exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);
export class AgentManager {
    private configDir: string = path.join(__dirname, 'agent-configs');
    private agentServer: ChildProcess | null = null;

    constructor() {
        fs.mkdir(this.configDir, { recursive: true });
    }

    async initialize() {
        await this.startAgents()
    }

    private async startAgents() {
        const characters = await this.getCharacters()

        this.agentServer = spawn("pnpm", [`start --characters="${characters}"`], {
            stdio: "pipe",
            shell: true,
            cwd: path.resolve(__dirname, "../../"),
        });

        this.agentServer.stdout?.on('data', (data) => {
            console.log(`${data}`);
        });

        this.agentServer.stderr?.on('data', (data) => {
            console.error(`Error: ${data}`);
        });

        this.agentServer.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`Agent process exited with code ${code}`);
            }
            this.agentServer = null;
        });
    }

    private async getCharacters(): Promise<string> {
        const files = await fs.readdir(this.configDir);
        return files.map((_filename) => path.join(this.configDir, _filename)).join(",")
    }

    async createAgent(agentId: string, config: AgentConfig) {
        // Create character config
        const characterConfig = await createCharacterConfig(config)

        // Write config to file
        await fs.writeFile(
        path.join(this.configDir, `${agentId}.json`),
        JSON.stringify(characterConfig, null, 2)
        );

        // Restart the agent server with updated charecters.
        // Adding an agent to a running server throws a PORT collision error.
        await this.killAgentServer();
        await this.startAgents();
        return { success: true, agentId };
    }

    async killAgentServer() {
        try {
            if (this.agentServer) {
                this.agentServer.kill();
                this.agentServer = null;
            }

            await execAsync('lsof -ti:3000 | xargs kill -9');

        } catch (error) {
            console.error('Error killing agent server:', error);
        }

        // Wait for port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
