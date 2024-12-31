#!/bin/bash

# Check for required environment variables
if [ -z "$CHARACTER_ID" ]; then
    echo "Error: CHARACTER_ID environment variable is not set"
    exit 1
fi

if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "Error: GOOGLE_CLOUD_PROJECT environment variable is not set"
    exit 1
fi

if [ -z "$GOOGLE_CREDENTIALS" ]; then
    echo "Error: GOOGLE_CREDENTIALS environment variable is not set"
    exit 1
fi

# Add this near the start of the script
echo "Debug: GOOGLE_CREDENTIALS structure:"
echo "$GOOGLE_CREDENTIALS" | jq '.' || echo "Failed to parse GOOGLE_CREDENTIALS as JSON"

# Debug the raw credentials with different approaches
echo "Debug: GOOGLE_CREDENTIALS raw content:"
echo "$GOOGLE_CREDENTIALS"

echo "Debug: Attempting to format GOOGLE_CREDENTIALS:"
echo "$GOOGLE_CREDENTIALS" | jq '.' || echo "Failed initial jq parsing"

# Try storing in a temporary file first
echo "$GOOGLE_CREDENTIALS" > /tmp/creds.json
echo "Debug: Content from temp file:"
cat /tmp/creds.json | jq '.' || echo "Failed parsing from file"

# Skip the failing jq parsing and go straight to extracting the private key
echo "Debug: Extracting private key..."
PRIVATE_KEY=$(echo "$GOOGLE_CREDENTIALS" | grep -A999 "PRIVATE KEY-----" | grep -B999 "-----END" || echo "Failed to extract private key")

# Write the private key to file ensuring proper formatting
echo "-----BEGIN PRIVATE KEY-----" > /tmp/private.pem
echo "$PRIVATE_KEY" | grep -v "PRIVATE KEY" >> /tmp/private.pem
echo "-----END PRIVATE KEY-----" >> /tmp/private.pem

# Debug the private key file
echo "Debug: Content of private.pem:"
cat /tmp/private.pem

# Set proper permissions
chmod 600 /tmp/private.pem

# Clean up temp file
rm -f /tmp/creds.json

# Get JWT token using service account credentials
echo "Generating JWT token..."
CURRENT_TIME=$(date +%s)
JWT_CLAIM=$(echo "$GOOGLE_CREDENTIALS" | jq -r --arg now "$CURRENT_TIME" '{
    "iss": .client_email,
    "scope": "https://www.googleapis.com/auth/cloud-platform",
    "aud": "https://oauth2.googleapis.com/token",
    "exp": ($now | tonumber + 3600),
    "iat": ($now | tonumber)
}')

# Create JWT header
JWT_HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 -w 0 | tr '+/' '-_' | tr -d '=')

# Create JWT payload
JWT_PAYLOAD=$(echo -n "$JWT_CLAIM" | base64 -w 0 | tr '+/' '-_' | tr -d '=')

# Create JWT signature
JWT_SIGNATURE=$(echo -n "${JWT_HEADER}.${JWT_PAYLOAD}" | openssl dgst -binary -sha256 -sign /tmp/private.pem | base64 -w 0 | tr '+/' '-_' | tr -d '=')

# Combine to create final JWT
JWT_TOKEN="${JWT_HEADER}.${JWT_PAYLOAD}.${JWT_SIGNATURE}"

echo "JWT token generated. Getting access token..."

# Get access token
ACCESS_TOKEN_RESPONSE=$(curl -s -X POST https://oauth2.googleapis.com/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=$JWT_TOKEN")

echo "Token response: $ACCESS_TOKEN_RESPONSE"

ACCESS_TOKEN=$(echo "$ACCESS_TOKEN_RESPONSE" | jq -r '.access_token')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    echo "Error: Failed to get access token"
    echo "Full response from token endpoint:"
    echo "$ACCESS_TOKEN_RESPONSE"
    rm -f /tmp/private.pem
    exit 1
fi

# Clean up
rm -f /tmp/private.pem

echo "Access token obtained successfully"

# Read the secret using the access token
echo "Fetching secret for twitter-$CHARACTER_ID..."
SECRET_RESPONSE=$(curl -s -X GET \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$GOOGLE_CLOUD_PROJECT/secrets/twitter-$CHARACTER_ID/versions/latest:access")

echo "Raw secret response:"
echo "$SECRET_RESPONSE"

# Check for API errors first
if echo "$SECRET_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    echo "Error: API request failed"
    echo "Error message: $(echo "$SECRET_RESPONSE" | jq -r '.error.message')"
    echo "Error code: $(echo "$SECRET_RESPONSE" | jq -r '.error.code')"
    echo "Error status: $(echo "$SECRET_RESPONSE" | jq -r '.error.status')"
    exit 1
fi

# Extract and decode the secret value
echo "Decoding secret value..."
SECRET_VALUE=$(echo "$SECRET_RESPONSE" | jq -r '.payload.data' | base64 -d 2>/dev/null)

# Check if base64 decode failed
if [ $? -ne 0 ]; then
    echo "Error: Failed to decode base64 secret value"
    echo "Base64 value: $(echo "$SECRET_RESPONSE" | jq -r '.payload.data')"
    exit 1
fi

if [ -z "$SECRET_VALUE" ]; then
    echo "Error: Empty secret value after decoding"
    echo "Response: $SECRET_RESPONSE"
    exit 1
fi

echo "Successfully decoded secret. Attempting to parse as JSON..."

# Try to parse as JSON and set environment variables if successful
if echo "$SECRET_VALUE" | jq -e . >/dev/null 2>&1; then
    echo "Secret is valid JSON, setting environment variables..."
    export TWITTER_USERNAME=$(echo "$SECRET_VALUE" | jq -r '.twitterUsername')
    export TWITTER_PASSWORD=$(echo "$SECRET_VALUE" | jq -r '.twitterPassword')
    export TWITTER_EMAIL=$(echo "$SECRET_VALUE" | jq -r '.twitterEmail')

    # Verify the variables were set
    echo "Environment variables set:"
    echo "TWITTER_USERNAME: $TWITTER_USERNAME"
    echo "TWITTER_EMAIL: $TWITTER_EMAIL"
    echo "TWITTER_PASSWORD: [REDACTED]"
else
    echo "Error: Secret is not in expected JSON format"
    exit 1
fi