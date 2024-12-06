interface SocialLinks {
    telegramChatLink?: string;
    telegramChannelLink?: string;
    twitterLink?: string;
    discordLink?: string;
    instagramLink?: string;
    youtubeLink?: string;
    tiktokLink?: string;
    websiteLink?: string;
}

interface TwitterAccount {
    username: string;
    password: string;
    email: string;
}

export interface AgentConfig {
    name: string;
    voice: string;
    socialLinks?: SocialLinks;
    bio?: string;
    ageGroup?: string;
    answerStyle?: string; // used to create style.all array
    personality?: string; // used to create adjectives array
    behavior?: string;
    goal?: string;
    mission?: string;
    likes?: string;
    dislikes?: string;
    isNsfw?: boolean;
    twitterAccount?: TwitterAccount;
}

export interface AgentProcess {
    process: any;
    schedule?: any;
    config: AgentConfig;
}
