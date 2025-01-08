import {
    Content,
    IAgentRuntime,
    IImageDescriptionService,
    Memory,
    State,
    UUID,
    getEmbeddingZeroVector,
    elizaLogger,
    stringToUuid,
} from "@ai16z/eliza";
import {
    QueryTweetsResponse,
    Scraper,
    SearchMode,
    Tweet,
} from "agent-twitter-client";
import { EventEmitter } from "events";
import { TwitterApi, TwitterApiTokens } from "twitter-api-v2";

export function extractAnswer(text: string): string {
    const startIndex = text.indexOf("Answer: ") + 8;
    const endIndex = text.indexOf("<|endoftext|>", 11);
    return text.slice(startIndex, endIndex);
}

type TwitterProfile = {
    id: string;
    username: string;
    screenName: string;
    bio: string;
    nicknames: string[];
};

class RequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing: boolean = false;

    async add<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await request();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        this.processing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift()!;
            try {
                await request();
            } catch (error) {
                console.error("Error processing request:", error);
                this.queue.unshift(request);
                await this.exponentialBackoff(this.queue.length);
            }
            await this.randomDelay();
        }

        this.processing = false;
    }

    private async exponentialBackoff(retryCount: number): Promise<void> {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    private async randomDelay(): Promise<void> {
        const delay = Math.floor(Math.random() * 2000) + 1500;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
}

// Add new type to handle both client types
type TwitterClient = Scraper | TwitterApi;

export class ClientBase extends EventEmitter {
    static _twitterClients: { [accountIdentifier: string]: TwitterClient } = {};
    twitterClient: TwitterClient;
    clientType: "api" | "scraper";
    runtime: IAgentRuntime;
    directions: string;
    lastCheckedTweetId: bigint | null = null;
    imageDescriptionService: IImageDescriptionService;
    temperature: number = 0.5;

    requestQueue: RequestQueue = new RequestQueue();

    profile: TwitterProfile | null;

    async cacheTweet(tweet: Tweet): Promise<void> {
        if (!tweet) {
            console.warn("Tweet is undefined, skipping cache");
            return;
        }

        this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
    }

    async getCachedTweet(tweetId: string): Promise<Tweet | undefined> {
        const cached = await this.runtime.cacheManager.get<Tweet>(
            `twitter/tweets/${tweetId}`
        );

        return cached;
    }

    async getTweet(tweetId: string): Promise<Tweet> {
        const cachedTweet = await this.getCachedTweet(tweetId);
        if (cachedTweet) return cachedTweet;

        const tweet = await this.requestQueue.add(async () => {
            if (this.clientType === "api") {
                const result = await (
                    this.twitterClient as TwitterApi
                ).v2.singleTweet(tweetId);
                return {
                    id: result.data.id,
                    text: result.data.text,
                    hashtags: [],
                    mentions: [],
                    photos: [],
                    thread: [],
                    urls: [],
                    videos: [],
                    timestamp: Date.now(),
                    userId: this.profile.id,
                    username: this.profile.username,
                    name: this.profile.screenName,
                    conversationId: result.data.id,
                    permanentUrl: `https://twitter.com/${this.profile.username}/status/${result.data.id}`,
                } as Tweet;
            } else {
                return (this.twitterClient as Scraper).getTweet(tweetId);
            }
        });

        await this.cacheTweet(tweet);
        return tweet;
    }

    callback: (self: ClientBase) => any = null;

    onReady() {
        throw new Error(
            "Not implemented in base class, please call from subclass"
        );
    }

    constructor(runtime: IAgentRuntime) {
        super();
        this.runtime = runtime;
        const username = this.runtime.getSetting("TWITTER_USERNAME");

        this.clientType =
            runtime.getSetting("TWITTER_USE_API") === "true"
                ? "api"
                : "scraper";

        if (this.clientType === "api") {
            this.twitterClient = new TwitterApi(
                runtime.getSetting("TWITTER_ACCESS_TOKEN")
            );
        } else {
            this.twitterClient = new Scraper();
        }

        ClientBase._twitterClients[username] = this.twitterClient;

        this.directions =
            "- " +
            this.runtime.character.style.all.join("\n- ") +
            "- " +
            this.runtime.character.style.post.join();
    }

    async init() {
        const username = this.runtime.getSetting("TWITTER_USERNAME");
        console.log("username", username);
        if (!username) {
            throw new Error("Twitter username not configured");
        }

        if (this.clientType === "api") {
            try {
                // Single API call for authentication and profile
                const client = this.twitterClient as TwitterApi;
                if (!client) {
                    throw new Error("Twitter client not initialized");
                }
                this.profile = await this.fetchProfile(username);
            } catch (error) {
                console.error("Twitter API Error:", error);
                throw new Error(`Failed to authenticate with Twitter API: ${error.message}`);
            }
        } else {
            // Existing scraper authentication
            if (this.runtime.getSetting("TWITTER_COOKIES")) {
                const cookiesArray = JSON.parse(this.runtime.getSetting("TWITTER_COOKIES"));
                await this.setCookiesFromArray(cookiesArray);
            } else {
                const cachedCookies = await this.getCachedCookies(username);
                if (cachedCookies) {
                    await this.setCookiesFromArray(cachedCookies);
                }
            }

            // Initialize Twitter profile for scraper
            this.profile = await this.fetchProfile(username);
        }

        if (!this.profile) {
            throw new Error("Failed to load profile");
        }

        elizaLogger.log("Twitter user ID:", this.profile.id);
        elizaLogger.log("Twitter loaded:", JSON.stringify(this.profile, null, 10));

        // Store profile info for use in responses
        this.runtime.character.twitterProfile = {
            id: this.profile.id,
            username: this.profile.username,
            screenName: this.profile.screenName,
            bio: this.profile.bio,
            nicknames: this.profile.nicknames,
        };

        await this.loadLatestCheckedTweetId();
        await this.populateTimeline();
    }

    async fetchHomeTimeline(count: number): Promise<Tweet[]> {
        elizaLogger.debug("fetching home timeline");
        if (this.clientType === "api") {
            const result = await (
                this.twitterClient as TwitterApi
            ).v2.userTimeline(this.profile.id);
            return result.data.data.map((t) => ({
                id: t.id,
                text: t.text,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
                timestamp: Date.now(),
                userId: this.profile.id,
                username: this.profile.username,
                name: this.profile.screenName,
                conversationId: t.id,
                permanentUrl: `https://twitter.com/${this.profile.username}/status/${t.id}`,
            }));
        }
        return (this.twitterClient as Scraper)
            .getUserTweets(this.profile.id, count)
            .then((t) => t.tweets);
    }

    async fetchSearchTweets(
        query: string,
        maxTweets: number,
        searchMode: SearchMode,
        cursor?: string
    ): Promise<QueryTweetsResponse> {
        try {
            const timeoutPromise = new Promise((resolve) =>
                setTimeout(() => resolve({ tweets: [] }), 10000)
            );

            try {
                const result = await this.requestQueue.add(async () => {
                    if (this.clientType === "api") {
                        try {
                            const apiResult = await (
                                this.twitterClient as TwitterApi
                            ).v2.search(query, {
                                max_results: maxTweets,
                                "tweet.fields": ["created_at", "conversation_id", "author_id"]
                            });

                            if (!apiResult.data?.data) {
                                elizaLogger.warn(
                                    "No tweets found in search results"
                                );
                                return { tweets: [] };
                            }

                            return {
                                tweets: apiResult.data.data.map((t) => ({
                                    id: t.id,
                                    text: t.text,
                                    hashtags: [],
                                    mentions: [],
                                    photos: [],
                                    thread: [],
                                    urls: [],
                                    videos: [],
                                    timestamp: new Date(t.created_at).getTime(),
                                    userId: t.author_id,
                                    username: this.profile.username,
                                    name: this.profile.screenName,
                                    conversationId: t.conversation_id || t.id,
                                    permanentUrl: `https://twitter.com/i/web/status/${t.id}`,
                                })),
                            };
                        } catch (error) {
                            elizaLogger.error(
                                "Twitter API search error:",
                                error
                            );
                            if (error.code === 429 || error.code === 503) {
                                const resetTime = error.rateLimit?.reset || 60;
                                elizaLogger.warn(
                                    `Rate limited/Service unavailable, waiting ${resetTime} seconds`
                                );
                                await new Promise((resolve) =>
                                    setTimeout(resolve, resetTime * 1000)
                                );
                            }
                            return { tweets: [] };
                        }
                    }
                    return Promise.race([
                        (this.twitterClient as Scraper).fetchSearchTweets(
                            query,
                            maxTweets,
                            searchMode,
                            cursor
                        ),
                        timeoutPromise,
                    ]);
                });
                return (result ?? { tweets: [] }) as QueryTweetsResponse;
            } catch (error) {
                elizaLogger.error("Error fetching search tweets:", error);
                return { tweets: [] };
            }
        } catch (error) {
            elizaLogger.error("Error fetching search tweets:", error);
            return { tweets: [] };
        }
    }

    private async populateTimeline() {
        elizaLogger.debug("populating timeline...");

        const cachedTimeline = await this.getCachedTimeline();

        // If we have a cached timeline, use it
        if (cachedTimeline && cachedTimeline.length > 0) {
            elizaLogger.log("Using cached timeline");

            const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
                roomIds: cachedTimeline.map((tweet) =>
                    stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
                ),
            });

            const existingMemoryIds = new Set(existingMemories.map((memory) => memory.id.toString()));
            const tweetsToSave = cachedTimeline.filter(
                (tweet) => !existingMemoryIds.has(stringToUuid(tweet.id + "-" + this.runtime.agentId))
            );

            // Process cached tweets
            for (const tweet of tweetsToSave) {
                await this.saveTweetAsMemory(tweet);
            }

            elizaLogger.log(`Populated ${tweetsToSave.length} missing tweets from cache`);
            return;
        }

        // If no cache, fetch minimal data
        try {
            // Fetch timeline with reduced count
            const timeline = await this.requestQueue.add(() =>
                this.fetchHomeTimeline(5)  // Reduced from 50 to 5
            );

            // Skip mentions for initial load to avoid rate limits
            const allTweets = timeline;

            // Save new tweets
            for (const tweet of allTweets) {
                await this.saveTweetAsMemory(tweet);
            }

            // Cache results
            await this.cacheTimeline(timeline);

        } catch (error) {
            if (error.code === 429) {
                elizaLogger.warn("Rate limited, will retry later");
                return;
            }
            throw error;
        }
    }

    // Helper method to reduce duplication
    private async saveTweetAsMemory(tweet: Tweet) {
        const roomId = stringToUuid(tweet.conversationId + "-" + this.runtime.agentId);
        const userId = tweet.userId === this.profile.id ?
            this.runtime.agentId :
            stringToUuid(tweet.userId);

        // Ensure connections exist
        if (tweet.userId === this.profile.id) {
            await this.runtime.ensureConnection(
                this.runtime.agentId,
                roomId,
                this.profile.username,
                this.profile.screenName,
                "twitter"
            );
        } else {
            await this.runtime.ensureConnection(
                userId,
                roomId,
                tweet.username,
                tweet.name,
                "twitter"
            );
        }

        // Create memory
        const content = {
            text: tweet.text,
            url: tweet.permanentUrl,
            source: "twitter",
            inReplyTo: tweet.inReplyToStatusId ?
                stringToUuid(tweet.inReplyToStatusId + "-" + this.runtime.agentId) :
                undefined,
        } as Content;

        await this.runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
            userId,
            content,
            agentId: this.runtime.agentId,
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp * 1000,
        });

        await this.cacheTweet(tweet);
    }

    async setCookiesFromArray(cookiesArray: any[]) {
        if (this.clientType === "scraper") {
            const cookieStrings = cookiesArray.map(
                (cookie) =>
                    `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${
                        cookie.secure ? "Secure" : ""
                    }; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${
                        cookie.sameSite || "Lax"
                    }`
            );
            await (this.twitterClient as Scraper).setCookies(cookieStrings);
        }
    }

    async saveRequestMessage(message: Memory, state: State) {
        if (message.content.text) {
            const recentMessage = await this.runtime.messageManager.getMemories(
                {
                    roomId: message.roomId,
                    count: 1,
                    unique: false,
                }
            );

            if (
                recentMessage.length > 0 &&
                recentMessage[0].content === message.content
            ) {
                elizaLogger.debug("Message already saved", recentMessage[0].id);
            } else {
                await this.runtime.messageManager.createMemory({
                    ...message,
                    embedding: getEmbeddingZeroVector(),
                });
            }

            await this.runtime.evaluate(message, {
                ...state,
                twitterClient: this.twitterClient,
            });
        }
    }

    async loadLatestCheckedTweetId(): Promise<void> {
        const latestCheckedTweetId =
            await this.runtime.cacheManager.get<string>(
                `twitter/${this.profile.username}/latest_checked_tweet_id`
            );

        if (latestCheckedTweetId) {
            this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
        }
    }

    async cacheLatestCheckedTweetId() {
        if (this.lastCheckedTweetId) {
            await this.runtime.cacheManager.set(
                `twitter/${this.profile.username}/latest_checked_tweet_id`,
                this.lastCheckedTweetId.toString()
            );
        }
    }

    async getCachedTimeline(): Promise<Tweet[] | undefined> {
        return await this.runtime.cacheManager.get<Tweet[]>(
            `twitter/${this.profile.username}/timeline`
        );
    }

    async cacheTimeline(timeline: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.profile.username}/timeline`,
            timeline,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async cacheMentions(mentions: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.profile.username}/mentions`,
            mentions,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async getCachedCookies(username: string) {
        return await this.runtime.cacheManager.get<any[]>(
            `twitter/${username}/cookies`
        );
    }

    async cacheCookies(username: string, cookies: any[]) {
        await this.runtime.cacheManager.set(
            `twitter/${username}/cookies`,
            cookies
        );
    }

    async getCachedProfile(username: string) {
        return await this.runtime.cacheManager.get<TwitterProfile>(
            `twitter/${username}/profile`
        );
    }

    async cacheProfile(profile: TwitterProfile) {
        await this.runtime.cacheManager.set(
            `twitter/${profile.username}/profile`,
            profile
        );
    }

    async fetchProfile(username: string): Promise<TwitterProfile> {
        const cached = await this.getCachedProfile(username);
        console.log("cached", cached);
        if (cached) return cached;

        try {
            let profile: TwitterProfile;

            if (this.clientType === "api") {
                const client = this.twitterClient as TwitterApi;
                const apiProfile = await client.v2.userByUsername(username, {
                    "user.fields": ["description"],
                });

                profile = {
                    id: apiProfile.data.id,
                    username,
                    screenName:
                        apiProfile.data.name || this.runtime.character.name,
                    bio:
                        apiProfile.data.description ||
                        (typeof this.runtime.character.bio === "string"
                            ? this.runtime.character.bio
                            : this.runtime.character.bio[0] || ""),
                    nicknames:
                        this.runtime.character.twitterProfile?.nicknames || [],
                };
            } else {
                // Existing scraper profile fetch
                profile = await this.requestQueue.add(async () => {
                    const scraperProfile = await (
                        this.twitterClient as Scraper
                    ).getProfile(username);
                    return {
                        id: scraperProfile.userId,
                        username,
                        screenName:
                            scraperProfile.name || this.runtime.character.name,
                        bio:
                            scraperProfile.biography ||
                            (typeof this.runtime.character.bio === "string"
                                ? this.runtime.character.bio
                                : this.runtime.character.bio[0] || ""),
                        nicknames:
                            this.runtime.character.twitterProfile?.nicknames ||
                            [],
                    };
                });
            }

            await this.cacheProfile(profile);
            return profile;
        } catch (error) {
            console.error("Error fetching Twitter profile:", error);
            return undefined;
        }
    }

    // Add method for refreshing tokens
    private async refreshTokens(): Promise<void> {
        if (this.clientType !== "api") return;

        const { accessToken, refreshToken } = await (
            this.twitterClient as TwitterApi
        ).refreshOAuth2Token(process.env.TWITTER_REFRESH_TOKEN);
        this.twitterClient = new TwitterApi({
            accessToken,
            refreshToken,
            appKey: process.env.TWITTER_APP_KEY,
            appSecret: process.env.TWITTER_APP_SECRET,
        } as TwitterApiTokens);
    }

    // Example of a method that uses the authenticated client
    async tweet(text: string): Promise<Tweet> {
        if (this.clientType !== "api") {
            throw new Error("Tweeting only supported with API client");
        }

        try {
            const result = await (this.twitterClient as TwitterApi).v2.tweet(
                text
            );
            return {
                id: result.data.id,
                text: result.data.text,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
                timestamp: Date.now(),
                userId: this.profile.id,
                username: this.profile.username,
                name: this.profile.screenName,
                conversationId: result.data.id,
                permanentUrl: `https://twitter.com/${this.profile.username}/status/${result.data.id}`,
            } as Tweet;
        } catch (error) {
            if (error.code === 401) {
                // Token expired, try refreshing
                await this.refreshTokens();
                // Retry tweet
                return this.tweet(text);
            }
            throw error;
        }
    }
}
