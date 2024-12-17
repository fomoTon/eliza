#!/bin/bash

# Navigate to the script's directory
cd "$(dirname "$0")"/..
echo "Fetching character file started."

# Check if required environment variables are set
if [ -z "$MULTI_ELIZA_BASE_URL" ] || [ -z "$CHARACTER_ID" ]; then
    echo "Error: MULTI_ELIZA_BASE_URL and CHARACTER_ID must be set in environment"
    exit 1
fi

# Make the API request and store the full response
response=$(curl -s "${MULTI_ELIZA_BASE_URL}/api/agent?id=${CHARACTER_ID}")

# Check if curl command was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to make API request"
    exit 1
fi

# Extract success value using jq
success=$(echo "$response" | jq -r '.success')

# Check if response indicates success
if [ "$success" = "true" ]; then
    # Extract just the agent field and write to file
    echo "$response" | jq -r '.agent.character' > ./characters/character.json
    echo "Successfully created character.json"
else
    echo "Error: API request was not successful"
    echo "Response: $response"
    exit 1
fi