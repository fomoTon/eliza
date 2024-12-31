from google.cloud import secretmanager
from google.oauth2 import service_account
import json
import os

print("Initializing Secret Manager client...")
creds_json = json.loads(os.getenv('GOOGLE_CREDENTIALS', '{}'))
credentials = service_account.Credentials.from_service_account_info(creds_json)
client = secretmanager.SecretManagerServiceClient(credentials=credentials)

# Print environment variables for debugging
print(f"GOOGLE_CLOUD_PROJECT: {os.getenv('GOOGLE_CLOUD_PROJECT')}")
print(f"CHARACTER_ID: {os.getenv('CHARACTER_ID')}")
print(f"GOOGLE_CREDENTIALS: {os.getenv('GOOGLE_CREDENTIALS')}")

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
    print(f"Full error details: {str(e)}")
    raise

# Set environment variables
print("Setting environment variables...")
os.environ["TWITTER_USERNAME"] = secret["username"]
os.environ["TWITTER_PASSWORD"] = secret["password"]
os.environ["TWITTER_EMAIL"] = secret["email"]
print("Environment variables set successfully")