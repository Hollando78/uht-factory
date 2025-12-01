#!/usr/bin/env python3

import asyncio
import httpx
import os
import json

async def list_gemini_models():
    """List available Gemini models to find the correct image generation model"""
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found in environment")
        return
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={"x-goog-api-key": api_key}
            )
            
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                models = result.get("models", [])
                
                print(f"\n✅ Found {len(models)} available models:")
                
                for model in models:
                    name = model.get("name", "Unknown")
                    display_name = model.get("displayName", "No display name")
                    description = model.get("description", "No description")
                    supported_methods = model.get("supportedGenerationMethods", [])
                    
                    print(f"\n📋 {name}")
                    print(f"   Display: {display_name}")
                    print(f"   Methods: {', '.join(supported_methods)}")
                    print(f"   Description: {description[:100]}...")
                    
                    # Look for image generation models
                    if "generateContent" in supported_methods and "image" in description.lower():
                        print(f"   🖼️  POTENTIAL IMAGE MODEL!")
                        
                print("\n🔍 Looking for image generation capabilities...")
                image_models = [m for m in models if "image" in m.get("description", "").lower() or "imagen" in m.get("name", "").lower()]
                
                if image_models:
                    print(f"\n🖼️  Found {len(image_models)} image-related models:")
                    for model in image_models:
                        print(f"   - {model.get('name', 'Unknown')}: {model.get('displayName', 'No name')}")
                else:
                    print("\n❌ No image generation models found")
                        
            else:
                print(f"❌ Failed to list models: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Error listing models: {e}")

if __name__ == "__main__":
    asyncio.run(list_gemini_models())