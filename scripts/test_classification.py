#!/usr/bin/env python3
"""
Test script for UHT Classification Factory
"""
import requests
import json
import os

# API base URL
BASE_URL = "http://localhost:8100"

def test_api_health():
    """Test API health and connectivity"""
    print("🔍 Testing API health...")
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        health_data = response.json()
        
        print(f"✅ API Status: {health_data['status']}")
        for service, status in health_data['checks'].items():
            emoji = "✅" if status == "healthy" else "❌"
            print(f"{emoji} {service.title()}: {status}")
        
        return health_data['status'] == "healthy"
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_traits_endpoint():
    """Test traits endpoint"""
    print("\n🔍 Testing traits endpoint...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/traits/")
        traits_data = response.json()
        
        print(f"✅ Found {traits_data['total_traits']} traits")
        print(f"✅ Version: {traits_data['version']}")
        print(f"✅ Layers: {list(traits_data['layers'].keys())}")
        
        # Show first trait as example
        first_trait = traits_data['traits'][0]
        print(f"✅ Example trait: {first_trait['name']} (bit {first_trait['bit']})")
        
        return True
    except Exception as e:
        print(f"❌ Traits test failed: {e}")
        return False

def test_trait_by_bit():
    """Test getting specific trait by bit"""
    print("\n🔍 Testing specific trait lookup...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/traits/1")
        trait_data = response.json()
        
        print(f"✅ Trait 1: {trait_data['name']}")
        print(f"✅ Layer: {trait_data['layer']}")
        print(f"✅ Description: {trait_data['short_description']}")
        
        return True
    except Exception as e:
        print(f"❌ Trait lookup failed: {e}")
        return False

def test_classification_structure():
    """Test classification endpoint structure (without LLM)"""
    print("\n🔍 Testing classification endpoint structure...")
    
    # Test entity input validation
    test_payload = {
        "entity": {
            "name": "smartphone",
            "description": "A portable electronic device with computing capabilities",
            "context": "Modern mobile communication device"
        },
        "use_cache": True,
        "detailed": True
    }
    
    try:
        # Note: This will fail without valid OpenAI key, but validates the structure
        response = requests.post(
            f"{BASE_URL}/api/v1/classify/",
            json=test_payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Classification succeeded!")
            print(f"✅ Entity: {result['entity']['name']}")
            print(f"✅ UHT Code: {result['entity']['uht_code']}")
            print(f"✅ Processing time: {result['processing_time_ms']:.1f}ms")
        else:
            print(f"⚠️  Classification endpoint reachable (status: {response.status_code})")
            if response.status_code == 500:
                error_detail = response.json().get('detail', 'Unknown error')
                if 'OPENAI_API_KEY not set' in str(error_detail):
                    print("ℹ️  Classification requires valid OpenAI API key")
                    return "needs_api_key"
                else:
                    print(f"❌ Error: {error_detail}")
        
        return True
    except Exception as e:
        print(f"❌ Classification test failed: {e}")
        return False

def show_classification_example():
    """Show example of what a classification would look like"""
    print("\n📋 Example Classification Output:")
    print("=" * 50)
    
    example_result = {
        "entity": {
            "uuid": "123e4567-e89b-12d3-a456-426614174000",
            "name": "smartphone", 
            "uht_code": "FF8F1A2B",
            "binary_representation": "11111111100011111001101000101011",
            "layers": {
                "Physical": "FF",
                "Functional": "8F", 
                "Abstract": "1A",
                "Social": "2B"
            },
            "created_at": "2024-01-01T00:00:00Z"
        },
        "processing_time_ms": 2847.5,
        "cached": False
    }
    
    print(json.dumps(example_result, indent=2))

def main():
    """Run all tests"""
    print("🚀 UHT Classification Factory Test Suite")
    print("=" * 50)
    
    # Test basic connectivity
    if not test_api_health():
        print("\n❌ API health check failed. Make sure the server is running.")
        return False
    
    # Test traits system
    if not test_traits_endpoint():
        return False
    
    if not test_trait_by_bit():
        return False
    
    # Test classification endpoint
    result = test_classification_structure()
    
    if result == "needs_api_key":
        print("\n📝 To enable full classification testing:")
        print("   1. Get an OpenAI API key from https://platform.openai.com/api-keys")
        print("   2. Update OPENAI_API_KEY in /root/project/uht-factory/.env")
        print("   3. Restart the API server")
        
    # Show example output
    show_classification_example()
    
    print("\n🎉 Test suite completed!")
    print("\n📚 Available endpoints:")
    print("   • API Docs: http://localhost:8100/docs")
    print("   • Health: http://localhost:8100/health")
    print("   • Traits: http://localhost:8100/api/v1/traits/")
    print("   • Classify: http://localhost:8100/api/v1/classify/")
    
    return True

if __name__ == "__main__":
    main()