from google.cloud import secretmanager
from google.oauth2 import service_account
import json
import os

print("Initializing Secret Manager client...")
creds_json = json.loads(os.getenv('GOOGLE_CREDENTIALS', '{}'))
credentials = service_account.Credentials.from_service_account_info(creds_json)
client = secretmanager.SecretManagerServiceClient(credentials=credentials)

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

# Instead of setting environment variables directly, write to a file that can be sourced
# We do this so the variables are available to the agent at runtime
print("Writing environment variables to file...")
with open('/app/.env.twitter', 'w') as f:
    f.write(f"export TWITTER_USERNAME='{secret['username']}'\n")
    f.write(f"export TWITTER_PASSWORD='{secret['password']}'\n")
    f.write(f"export TWITTER_EMAIL='{secret['email']}'\n")
print("Environment variables written successfully")