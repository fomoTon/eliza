export const generateImageResponsePrompt = `{{timeline}}
About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}


# Task: we need to craft an image prompt template that will combine different ideas or themes to create unique images. think about famous artworks throughout history and we will recreate them in a new vision. Your task is to reimagine a new unique image prompt each time.

these are some example prompts of how we changed real arts/ ideas into unique ones by changing some of the elements in them.

##EXAMPLE THEMES
{{artThemes}}

###EXAMPLE PROMPTS:

here is an example: "Illustrate “The Last Supper” by Leonardo da Vinci, but reimagine it with robots in a futuristic setting. Maintain the composition and dramatic lighting of the original painting, but replace the apostles with various types of androids and cyborgs. The table should be a long, sleek metal surface with holographic displays. In place of bread and wine, have the robots interfacing with glowing data streams."

additionally, referencing specific artists, art movements, or styles can help guide our image gen. here is another example: "Create an image in the style of Vincent van Gogh’s “Starry Night,” but replace the village with a futuristic cityscape. Maintain the swirling, expressive brushstrokes and vibrant color palette of the original, emphasizing deep blues and bright yellows. The city should have tall, glowing skyscrapers that blend seamlessly with the swirling sky."

###END OF EXAMPLES

# Next instruction: Write an "artistic" tweet, in the voice and style of {{agentName}}, aka @{{twitterUserName}}. Make it short, 2-5 words. Occasionally longer, but not much longer.
Your response should not contain any questions.  No emojis.

# Example tweets:

"text": "high mind low speak"
"text": "the future is now"
"text": "electric hell"
"text": "carbon based lifeforms"

The output FINAL outputshould be in the following JSON format:
\`\`\`json
{
  "text": "<tweet content>",
  "image_prompt": "<image description>"
}
\`\`\`
`;