#!/usr/bin/env python3

import asyncio
import httpx
import json

async def generate_windmill_image():
    """Generate an image for the Windmill (Wind Energy Conversion System) entity"""
    
    # UUID for "Wind Energy Conversion System" (Windmill)
    test_request = {
        "entity_uuid": "f35ac095-b9ff-4962-97c5-6cc1c0f54831",
        "custom_prompt": "Create a detailed image of a traditional windmill with spinning blades against a blue sky, showing its mechanical structure for converting wind energy",
        "style": "realistic"
    }
    
    print(f"🌪️ Generating image for Windmill entity:")
    print(f"{json.dumps(test_request, indent=2)}")
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "http://localhost:8100/api/v1/images/generate",
                json=test_request,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"\n📊 Response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Windmill image generation successful!")
                print(f"🖼️  Generated image URL: {result.get('image_url', 'None')}")
                print(f"⏱️  Generation time: {result.get('generation_time_ms', 0)}ms")
                print(f"💰 Cost: ${result.get('cost_usd', 0)}")
                print(f"🤖 Model used: {result.get('model_used', 'Unknown')}")
                
                # Check if image file was created
                import os
                image_url = result.get('image_url')
                if image_url:
                    file_path = f".{image_url}"
                    if os.path.exists(file_path):
                        print(f"✅ Image file saved at: {file_path}")
                        file_size = os.path.getsize(file_path)
                        print(f"📁 File size: {file_size:,} bytes")
                        print(f"🌐 Access URL: http://localhost:8100{image_url}")
                    else:
                        print(f"❌ Image file not found at: {file_path}")
            else:
                print(f"❌ Image generation failed: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Test failed with error: {e}")

if __name__ == "__main__":
    asyncio.run(generate_windmill_image())