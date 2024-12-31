from google.cloud import secretmanager
import json
import os

print("Initializing Secret Manager client...")
client = secretmanager.SecretManagerServiceClient()

# Build the resource name
secret_name = f"projects/{os.getenv('GOOGLE_CLOUD_PROJECT')}/secrets/twitter-{os.getenv('CHARACTER_ID')}/versions/latest"
print(f"Accessing secret: {secret_name}")

# Access the secret
try:
    response = client.access_secret_version(request={"name": secret_name})
    secret = json.loads(response.payload.data.decode("UTF-8"))
    print("Successfully retrieved and decoded secret")
except Exception as e:
    print(f"Error accessing secret: {e}")
    raise

# Set environment variables
print("Setting environment variables...")
os.environ["TWITTER_USERNAME"] = secret["twitterUsername"]
os.environ["TWITTER_PASSWORD"] = secret["twitterPassword"]
os.environ["TWITTER_EMAIL"] = secret["twitterEmail"]
print("Environment variables set successfully")