from openai import OpenAI
import os
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
   api_key = api_key
)

# Recommended model for SQL agents
MODEL_NAME = "gpt-4.1"

def call_llm(messages):
    """Call OpenAI LLM API and return response content."""
    import logging
    
    logger = logging.getLogger(__name__)
    
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            temperature=0,  # important for deterministic SQL
        )

        if not response.choices or not response.choices[0].message.content:
            logger.error("LLM returned empty response")
            raise ValueError("The AI service returned an empty response. Please try again.")
        
        return response.choices[0].message.content.strip()
    except Exception as e:
        error_msg = str(e)
        logger.error(f"OpenAI API error: {error_msg}")
        
        # Provide user-friendly error messages
        if "api key" in error_msg.lower() or "authentication" in error_msg.lower():
            raise ValueError("API authentication failed. Please check your API configuration.")
        elif "rate limit" in error_msg.lower() or "quota" in error_msg.lower():
            raise ValueError("API rate limit exceeded. Please try again in a moment.")
        elif "timeout" in error_msg.lower():
            raise ValueError("The AI service took too long to respond. Please try again.")
        else:
            raise ValueError("Unable to process your question. Please try again later.")
