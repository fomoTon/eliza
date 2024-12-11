import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    generateImage
} from "@ai16z/eliza";
import { elizaLogger } from "@ai16z/eliza";
import { ClientBase } from "./base.ts";
import { generateImageResponsePrompt } from "./templates";


export class TwitterMediaClient {
    private client: ClientBase;
    private runtime: IAgentRuntime;

    async start() {
        console.log('Starting media client');
        const generateMediaTweetLoop = async () => {
            await this.generateMediaTweet();
            // run randomly every 1-2 hours
            const randomDelay = Math.floor(Math.random() * 7200000) + 3600000;
            setTimeout(() => {
                generateMediaTweetLoop();
            }, randomDelay);
        }
        generateMediaTweetLoop();
    }

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    private async generateMediaTweet() {
        console.log("Generating new Media tweet");
        try {
            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile.username
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");
            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics,
                        action: "",
                    },
                },
                {
                    twitterUserName: this.client.profile.username,
                    artThemes: this.runtime.character.artThemes.slice(0, 6).join(", "),
                }
            );

            console.log('State check for media tweet', state);
            // Generate new tweet
            const context = composeContext({
                state,
                template: generateImageResponsePrompt,
            });

            elizaLogger.debug("generate image response prompt:\n" + context);

            const newMediaTweetContent = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // If the response is a string, parse it into an object
            const parsedResponse = JSON.parse(newMediaTweetContent);

            // Access the properties
            const tweetText = parsedResponse.text.replaceAll(/\\n/g, "\n").trim().replace(/\s+/g, ' ');
            const imagePrompt = parsedResponse.image_prompt;

            if (this.runtime.getSetting("TWITTER_DRY_RUN") === "true") {
                elizaLogger.info(
                    `Dry run: would have posted image tweet:\n tweetText: ${tweetText}\n imagePrompt: ${imagePrompt}`
                );
                return;
            }
            try {
                elizaLogger.log(`Posting new tweet:\n tweetText: ${tweetText}\n imagePrompt: ${imagePrompt}`);
                const image = await this.client.requestQueue.add(() =>
                    generateImage({
                        prompt: imagePrompt,
                        width: 1024,
                        height: 1024,
                    }, this.runtime));

                console.log('Image generated', image);
                // convert base64 string to buffer
                const imageBuffer = Buffer.from(image.data[0], "base64");

                const result = await this.client.requestQueue.add(
                    async () =>
                        await this.client.twitterClient.sendTweet(tweetText, undefined, [
                            {
                                data: imageBuffer,
                                mediaType: "image/jpeg",
                            }
                        ])
                );
                const body = await result.json();
                if (!body?.data?.create_tweet?.tweet_results?.result) {
                    console.error("Error sending tweet with media; Bad response:", body);
                    return;
                }
                const tweetResult = body.data.create_tweet.tweet_results.result;

                const tweet = {
                    id: tweetResult.rest_id,
                    name: this.client.profile.screenName,
                    username: this.client.profile.username,
                    text: tweetResult.legacy.full_text,
                    conversationId: tweetResult.legacy.conversation_id_str,
                    createdAt: tweetResult.legacy.created_at,
                    timestamp: new Date(
                        tweetResult.legacy.created_at
                    ).getTime(),
                    userId: this.client.profile.id,
                    inReplyToStatusId:
                        tweetResult.legacy.in_reply_to_status_id_str,
                    permanentUrl: `https://twitter.com/${this.runtime.getSetting("TWITTER_USERNAME")}/status/${tweetResult.rest_id}`,
                    hashtags: [],
                    mentions: [],
                    photos: [],
                    thread: [],
                    urls: [],
                    videos: [],
                } as Tweet;

                await this.runtime.cacheManager.set(
                    `twitter/${this.client.profile.username}/lastPost`,
                    {
                        id: tweet.id,
                        timestamp: Date.now(),
                    }
                );

                await this.client.cacheTweet(tweet);

                elizaLogger.log(`Tweet with media posted:\n ${tweet.permanentUrl}`);

                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: tweetText.trim(),
                        url: tweet.permanentUrl,
                        source: "twitter",
                    },
                    roomId,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: tweet.timestamp,
                });
            } catch (error) {
                elizaLogger.error("Error sending tweet:", error);
            }
        } catch (error) {
          console.error("Error generating new tweet:", error);
        }
    }
}
