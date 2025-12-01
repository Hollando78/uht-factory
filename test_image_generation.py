#!/usr/bin/env python3

import asyncio
import httpx
import json

async def test_gemini_image_generation():
    """Test the Gemini Flash image generation endpoint directly"""
    
    # Create a test request
    test_request = {
        "entity_uuid": "test-entity-12345",
        "custom_prompt": "Create a detailed image of a modern smartphone showing its sleek design and advanced features",
        "style": "realistic"
    }
    
    print(f"Testing image generation with request: {json.dumps(test_request, indent=2)}")
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "http://localhost:8100/api/v1/images/generate",
                json=test_request,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Image generation successful!")
                print(f"Generated image URL: {result.get('image_url', 'None')}")
                print(f"Generation time: {result.get('generation_time_ms', 0)}ms")
                print(f"Cost: ${result.get('cost_usd', 0)}")
                print(f"Model used: {result.get('model_used', 'Unknown')}")
                print(f"Prompt used: {result.get('prompt_used', 'No prompt')[:100]}...")
                
                # Check if image file was actually created
                import os
                image_url = result.get('image_url')
                if image_url:
                    # Convert URL to file path
                    file_path = f".{image_url}"
                    if os.path.exists(file_path):
                        print(f"✅ Image file saved at: {file_path}")
                        file_size = os.path.getsize(file_path)
                        print(f"File size: {file_size} bytes")
                    else:
                        print(f"❌ Image file not found at: {file_path}")
            else:
                print(f"❌ Image generation failed: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Test failed with error: {e}")

if __name__ == "__main__":
    asyncio.run(test_gemini_image_generation())