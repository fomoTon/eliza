#!/usr/bin/env python3
import os
import sys
import requests
import json
from pathlib import Path

def main():
    print("Fetching character file started.")

    # Debug: Print environment variables
    print(f"MULTI_ELIZA_BASE_URL: {os.getenv('MULTI_ELIZA_BASE_URL')}")
    print(f"CHARACTER_ID: {os.getenv('CHARACTER_ID')}")

    # Check if required environment variables are set
    if not os.getenv('MULTI_ELIZA_BASE_URL') or not os.getenv('CHARACTER_ID'):
        print("Error: MULTI_ELIZA_BASE_URL and CHARACTER_ID must be set in environment")
        sys.exit(1)

    # Make the API request
    try:
        response = requests.get(
            f"{os.getenv('MULTI_ELIZA_BASE_URL')}/api/agent",
            params={"id": os.getenv('CHARACTER_ID')}
        )
        response.raise_for_status()  # Raises an HTTPError for bad responses
        data = response.json()

        if data.get('success'):
            # Print the character data for debugging
            print("\nCharacter data received:")
            print(json.dumps(data['agent']['character'], indent=2))
            print("\n")

            # Ensure the characters directory exists
            Path('./characters').mkdir(exist_ok=True)

            # Write the character data to file
            with open('./characters/character.json', 'w') as f:
                json.dump(data['agent']['character'], f)
            print("Successfully created character.json")
        else:
            print("Error: API request was not successful")
            print(f"Response: {data}")
            sys.exit(1)

    except requests.RequestException as e:
        print(f"Error: Failed to make API request: {e}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON response: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()