from google.cloud import secretmanager
import json
import os

print("Initializing Secret Manager client...")
client = secretmanager.SecretManagerServiceClient()

# Print environment variables for debugging
print(f"GOOGLE_CLOUD_PROJECT: {os.getenv('GOOGLE_CLOUD_PROJECT')}")
print(f"CHARACTER_ID: {os.getenv('CHARACTER_ID')}")
print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS')}")

# Build the resource name
secret_name = f"projects/{os.getenv('GOOGLE_CLOUD_PROJECT')}/secrets/twitter-{os.getenv('CHARACTER_ID')}/versions/latest"
print(f"Accessing secret: {secret_name}")

# Access the secret
try:
    # Print the current credentials being used
    print("Current credentials:", client._credentials.service_account_email)

    response = client.access_secret_version(request={"name": secret_name})
    secret = json.loads(response.payload.data.decode("UTF-8"))
    print("Successfully retrieved and decoded secret")
except Exception as e:
    print(f"Error accessing secret: {e}")
    print(f"Full error details: {str(e)}")
    raise

# Set environment variables
print("Setting environment variables...")
os.environ["TWITTER_USERNAME"] = secret["twitterUsername"]
os.environ["TWITTER_PASSWORD"] = secret["twitterPassword"]
os.environ["TWITTER_EMAIL"] = secret["twitterEmail"]
print("Environment variables set successfully")