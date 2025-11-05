import os
from google import generativeai as genai
from dotenv import load_dotenv

# Load environment variables from your .env file
load_dotenv()

# Configure with your Google API key
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

print("\nAvailable Gemini models for your account:\n")
for m in genai.list_models():
    print(m.name)
from google import generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

for m in genai.list_models():
    print(m.name)
