import { IAgentRuntime } from "@ai16z/eliza";
import { z } from "zod";

export const twitterEnvSchema = z
    .object({
        TWITTER_DRY_RUN: z
            .string()
            .transform((val) => val.toLowerCase() === "true"),
        TWITTER_USERNAME: z.string().min(1, "Twitter username is required"),
        TWITTER_USE_API: z
            .union([z.boolean(), z.string()])
            .transform((val) =>
                typeof val === "string"
                    ? val.toLowerCase() === "true" || val === "api"
                    : val
            ),
        // API-specific fields
        TWITTER_ACCESS_TOKEN: z.string().optional(),
        TWITTER_REFRESH_TOKEN: z.string().optional(),
        TWITTER_APP_KEY: z.string().optional(),
        TWITTER_APP_SECRET: z.string().optional(),
        // Scraper-specific fields
        TWITTER_PASSWORD: z.string().optional(),
        TWITTER_EMAIL: z.string().optional(),
        TWITTER_COOKIES: z.string().optional(),
        TWITTER_SPACES_ENABLE: z.boolean().default(false),
    })
    .superRefine((data, ctx) => {
        if (data.TWITTER_USE_API) {
            if (
                !(
                    data.TWITTER_ACCESS_TOKEN &&
                    data.TWITTER_APP_KEY &&
                    data.TWITTER_APP_SECRET
                )
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "API credentials required when using API mode",
                });
            }
        } else {
            if (
                !(
                    data.TWITTER_COOKIES ||
                    (data.TWITTER_PASSWORD && data.TWITTER_EMAIL)
                )
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        "Scraper credentials required when using scraper mode",
                });
            }
            // Only validate email in scraper mode
            if (data.TWITTER_EMAIL && !data.TWITTER_EMAIL.includes("@")) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["TWITTER_EMAIL"],
                    message: "Valid Twitter email is required for scraper mode",
                });
            }
        }
    });

export type TwitterConfig = z.infer<typeof twitterEnvSchema>;

export async function validateTwitterConfig(
    runtime: IAgentRuntime
): Promise<TwitterConfig> {
    try {
        const config = {
            TWITTER_DRY_RUN:
                runtime.getSetting("TWITTER_DRY_RUN") ||
                process.env.TWITTER_DRY_RUN ||
                "false",
            TWITTER_USERNAME:
                runtime.getSetting("TWITTER_USERNAME") ||
                process.env.TWITTER_USERNAME,
            TWITTER_USE_API:
                runtime.getSetting("TWITTER_USE_API") ||
                process.env.TWITTER_USE_API ||
                "true",
            // API fields
            TWITTER_ACCESS_TOKEN:
                runtime.getSetting("TWITTER_ACCESS_TOKEN") ||
                process.env.TWITTER_ACCESS_TOKEN,
            TWITTER_REFRESH_TOKEN:
                runtime.getSetting("TWITTER_REFRESH_TOKEN") ||
                process.env.TWITTER_REFRESH_TOKEN,
            TWITTER_APP_KEY:
                runtime.getSetting("TWITTER_APP_KEY") ||
                process.env.TWITTER_APP_KEY,
            TWITTER_APP_SECRET:
                runtime.getSetting("TWITTER_APP_SECRET") ||
                process.env.TWITTER_APP_SECRET,
            // Scraper fields
            TWITTER_PASSWORD:
                runtime.getSetting("TWITTER_PASSWORD") ||
                process.env.TWITTER_PASSWORD,
            TWITTER_EMAIL:
                runtime.getSetting("TWITTER_EMAIL") ||
                process.env.TWITTER_EMAIL,
            TWITTER_COOKIES:
                runtime.getSetting("TWITTER_COOKIES") ||
                process.env.TWITTER_COOKIES,
            TWITTER_SPACES_ENABLE: Boolean(
                runtime.getSetting("TWITTER_SPACES_ENABLE") ||
                    process.env.TWITTER_SPACES_ENABLE ||
                    false
            ),
        };

        return twitterEnvSchema.parse(config);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Twitter configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
