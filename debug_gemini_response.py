#!/usr/bin/env python3

import asyncio
import httpx
import os
import json

async def debug_gemini_response():
    """Debug the actual Gemini API response structure"""
    
    api_key = "AIzaSyDG24Lx2dLRatCR_NQxVKp626GlYPb1bnc"
    model = "gemini-2.5-flash-image"
    
    prompt = "Create a simple blue circle"
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json"
    }
    
    request_data = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "candidateCount": 1,
            "maxOutputTokens": 2048
        }
    }
    
    print(f"🔍 Debugging Gemini API response for model: {model}")
    print(f"📝 Prompt: {prompt}")
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, json=request_data)
            
            print(f"\n📊 Response Status: {response.status_code}")
            print(f"📋 Response Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"\n✅ SUCCESS! Raw response structure:")
                print(json.dumps(result, indent=2)[:2000] + "..." if len(json.dumps(result, indent=2)) > 2000 else json.dumps(result, indent=2))
                
                # Look for image data in different possible locations
                if "candidates" in result:
                    print(f"\n🔍 Found {len(result['candidates'])} candidates")
                    for i, candidate in enumerate(result['candidates']):
                        print(f"\n📋 Candidate {i}:")
                        print(f"   Keys: {list(candidate.keys())}")
                        
                        if "content" in candidate:
                            content = candidate["content"]
                            print(f"   Content keys: {list(content.keys())}")
                            
                            if "parts" in content:
                                parts = content["parts"]
                                print(f"   Found {len(parts)} parts")
                                
                                for j, part in enumerate(parts):
                                    print(f"   Part {j} keys: {list(part.keys())}")
                                    
                                    # Check for image data
                                    if "inline_data" in part:
                                        print(f"   🖼️  Found inline_data in part {j}!")
                                        inline_data = part["inline_data"]
                                        print(f"      Inline data keys: {list(inline_data.keys())}")
                                        if "data" in inline_data:
                                            data_len = len(inline_data["data"])
                                            print(f"      ✅ Found image data: {data_len} characters")
                                            return inline_data["data"]
                                    
                                    if "text" in part:
                                        text_content = part["text"]
                                        print(f"   📝 Text content: {text_content[:100]}...")
                        
            else:
                print(f"❌ FAILED: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"❌ Error: {e}")

    return None

if __name__ == "__main__":
    asyncio.run(debug_gemini_response())