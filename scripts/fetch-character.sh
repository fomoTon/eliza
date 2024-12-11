#!/bin/bash

# Load environment variables from .env file
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found in parent directory"
    exit 1
fi

# Check if required environment variables are set
if [ -z "$MULTI_ELIZA_BASE_URL" ] || [ -z "$CHARACTER_ID" ]; then
    echo "Error: BASE_URL and CHARACTER_ID must be set in .env file"
    exit 1
fi

# Make the GET request and save to file
response=$(curl -s "${MULTI_ELIZA_BASE_URL}/api/agent?id=${CHARACTER_ID}")

# Check if curl command was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to make API request"
    exit 1
fi

# Check if response indicates success
if echo "$response" | grep -q '"success":true'; then
    echo "$response" > ../characters/character.json
    echo "Successfully created character.json"
else
    echo "Error: API request was not successful"
    echo "Response: $response"
    exit 1
fi