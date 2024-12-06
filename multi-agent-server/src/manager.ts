import { spawn } from "child_process";
import { AgentConfig, AgentProcess } from "./types";
import { createCharacterConfig } from "./manager.utils"
import fs from 'fs/promises';
import path from "path";
import cron from 'node-cron';

export class AgentManager {
  private agents: Map<string, AgentProcess> = new Map();
  private configDir: string = path.join(__dirname, 'agent-configs');

  constructor() {
    // Create a agent-configs directory if it doesnt exist.
    // This could be moved to a db.
    fs.mkdir(this.configDir, { recursive: true });
  }

  async initialize() {
    // Load all existing agent configs and start them
    const files = await fs.readdir(this.configDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const agentId = file.replace('.json', '');

        await this.startAgent(agentId);
      }
    }
  }

  private getConfigPath(agentId: string): string {
    return path.join(this.configDir, `${agentId}.json`);
  }

  async createAgent(agentId: string, config: AgentConfig) {

    const characterConfig = await createCharacterConfig(config)

    await fs.writeFile(
      this.getConfigPath(agentId),
      JSON.stringify(characterConfig, null, 2)
    );

    await this.startAgent(agentId);
    return { success: true, agentId };
  }

  private async startAgent(agentId: string) {
    // Kill existing process if any
    await this.stopAgent(agentId);

    const configPath = this.getConfigPath(agentId);
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

    // Start Eliza process with specific character config
    const process = spawn("pnpm", [`start --characters="${configPath}"`], {
        stdio: "pipe",
        shell: true,
        cwd: path.resolve(__dirname, "../../"),
    });

    // Handle process logging
    process.stdout.on('data', (data) => {
      console.log(`[${agentId}] ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`[${agentId}] Error: ${data}`);
    });

    // Store process reference
    this.agents.set(agentId, { process, config });

    // // Set up scheduling if configured
    // if (config.schedule) {
    //   const schedule = cron.schedule(config.schedule, () => {
    //     // Trigger scheduled actions (e.g., automated tweets)
    //     console.log(`Running scheduled tasks for ${agentId}`);
    //   });

    //   this.agents.get(agentId)!.schedule = schedule;
    // }
  }

  async stopAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Stop the cron schedule if it exists
      if (agent.schedule) {
        agent.schedule.stop();
      }

      // Kill the process
      if (agent.process) {
        agent.process.kill();
      }

      this.agents.delete(agentId);
    }
  }

  async updateAgent(agentId: string, updates: any) {
    const configPath = this.getConfigPath(agentId);
    const currentConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

    // Merge updates with current config
    const newConfig = { ...currentConfig, ...updates };
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

    // Restart agent with new config
    await this.startAgent(agentId);

    return { success: true, agentId };
  }

  async deleteAgent(agentId: string) {
    await this.stopAgent(agentId);
    await fs.unlink(this.getConfigPath(agentId));
    return { success: true };
  }

  async getAgent(agentId: string) {
    const configPath = this.getConfigPath(agentId);
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    return config;
  }
}
