#!/usr/bin/env python3
"""
Full classification test with OpenAI API
"""
import requests
import json
import time

BASE_URL = "http://localhost:8100"

def classify_entity(name, description, context=""):
    """Classify an entity using the UHT system"""
    
    print(f"\n🔍 Classifying: {name}")
    print("=" * 60)
    
    payload = {
        "entity": {
            "name": name,
            "description": description,
            "context": context
        },
        "use_cache": False,  # Force fresh classification
        "detailed": True
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/classify/",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120  # 2 minute timeout for 32 parallel LLM calls
        )
        
        if response.status_code == 200:
            result = response.json()
            entity = result['entity']
            
            print(f"✅ Classification successful!")
            print(f"📊 UHT Code: {entity['uht_code']}")
            print(f"🔢 Binary: {entity['binary_representation']}")
            print(f"\n📋 Layer Breakdown:")
            
            for layer_name, hex_value in entity['layers'].items():
                # Convert hex to binary for trait analysis
                layer_binary = bin(int(hex_value, 16))[2:].zfill(8)
                active_count = layer_binary.count('1')
                print(f"  • {layer_name}: {hex_value} ({active_count}/8 traits active)")
            
            # Show some trait evaluations
            if 'trait_evaluations' in entity and entity['trait_evaluations']:
                print(f"\n🎯 Sample Trait Evaluations:")
                for eval in entity['trait_evaluations'][:5]:  # Show first 5
                    symbol = "✓" if eval['applicable'] else "✗"
                    conf = eval['confidence'] * 100
                    print(f"  {symbol} Trait {eval['trait_bit']}: {eval['trait_name']}")
                    print(f"    Confidence: {conf:.0f}%")
                    print(f"    Reason: {eval['justification'][:100]}...")
            
            print(f"\n⏱️  Processing time: {result['processing_time_ms']:.1f}ms")
            print(f"💾 Cached: {result['cached']}")
            
            return entity
            
        else:
            print(f"❌ Classification failed (status: {response.status_code})")
            error = response.json()
            print(f"Error: {error.get('detail', 'Unknown error')}")
            return None
            
    except requests.Timeout:
        print("⏳ Request timed out (LLM processing takes time)")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def test_multiple_entities():
    """Test classification of various entity types"""
    
    test_entities = [
        {
            "name": "smartphone",
            "description": "A portable electronic device that combines mobile phone and computing capabilities, with touchscreen interface, internet connectivity, and ability to run applications",
            "context": "Modern digital communication and computing device"
        },
        {
            "name": "democracy",
            "description": "A system of government where power is vested in the people, who rule either directly or through elected representatives",
            "context": "Political system and social construct"
        },
        {
            "name": "oak tree",
            "description": "A large deciduous tree that produces acorns, with strong wood and distinctive lobed leaves",
            "context": "Natural biological organism"
        },
        {
            "name": "Bitcoin",
            "description": "A decentralized digital cryptocurrency that operates on blockchain technology without central authority",
            "context": "Digital financial asset and technology"
        }
    ]
    
    results = []
    
    print("🚀 UHT Classification Factory - Full Test Suite")
    print("=" * 60)
    print("Testing with real OpenAI GPT-4 evaluations...")
    
    for entity in test_entities:
        result = classify_entity(
            entity["name"],
            entity["description"],
            entity["context"]
        )
        if result:
            results.append(result)
        
        # Brief pause between classifications
        time.sleep(2)
    
    # Summary
    if results:
        print("\n📊 Classification Summary")
        print("=" * 60)
        print(f"{'Entity':<15} {'UHT Code':<10} {'Physical':<10} {'Functional':<12} {'Abstract':<10} {'Social':<10}")
        print("-" * 60)
        
        for r in results:
            layers = r['layers']
            print(f"{r['name']:<15} {r['uht_code']:<10} {layers['Physical']:<10} {layers['Functional']:<12} {layers['Abstract']:<10} {layers['Social']:<10}")
    
    return results

def explain_code(entity_name, uht_code):
    """Get explanation for a UHT code"""
    
    print(f"\n📖 Explaining UHT Code: {uht_code} for {entity_name}")
    print("=" * 60)
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/classify/explain",
            params={"entity_name": entity_name, "uht_code": uht_code}
        )
        
        if response.status_code == 200:
            explanation = response.json()
            
            print(f"🏷️ Entity: {explanation['entity']}")
            print(f"📊 Code: {explanation['uht_code']}")
            print(f"🔢 Binary: {explanation['binary']}")
            
            print(f"\n✅ Active Traits ({len(explanation['active_traits'])}):")
            for trait in explanation['active_traits'][:10]:  # Show first 10
                print(f"  • Bit {trait['bit']:2d} ({trait['layer']}): {trait['name']}")
            
            return explanation
        else:
            print(f"❌ Failed to get explanation")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    """Run full test suite"""
    
    print("🏭 UHT Classification Factory - Live Test")
    print("=" * 60)
    print("🔑 Using OpenAI GPT-4 for trait evaluations")
    print("🧠 Each entity evaluated by 32 parallel specialists")
    print("⚡ Generating 8-character hex taxonomy codes")
    print()
    
    # Test classification
    results = test_multiple_entities()
    
    # Explain a specific code if we got results
    if results and len(results) > 0:
        first_result = results[0]
        explain_code(first_result['name'], first_result['uht_code'])
    
    print("\n✨ Test complete!")
    print("\n📚 Access points:")
    print("  • API Documentation: http://localhost:8100/docs")
    print("  • Neo4j Browser: http://localhost:7474")
    print("  • Health Check: http://localhost:8100/health")

if __name__ == "__main__":
    main()