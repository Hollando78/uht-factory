#!/usr/bin/env python3
"""
Test classification of a smartphone with detailed output
"""
import requests
import json

def classify_smartphone():
    """Classify a smartphone and show detailed results"""
    
    print("🏭 UHT Classification Factory - Smartphone Test")
    print("=" * 60)
    
    payload = {
        "entity": {
            "name": "smartphone",
            "description": "A portable electronic device that combines mobile phone and computing capabilities",
            "context": "Modern digital communication device with touchscreen, apps, and internet"
        },
        "use_cache": False,
        "detailed": True
    }
    
    print("📱 Classifying: Smartphone")
    print("⏳ Sending to 32 parallel trait evaluators...")
    print()
    
    try:
        response = requests.post(
            "http://localhost:8100/api/v1/classify/",
            json=payload,
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            entity = result['entity']
            
            print("✅ CLASSIFICATION SUCCESSFUL!")
            print("=" * 60)
            print(f"📊 UHT Code: {entity['uht_code']}")
            print(f"🔢 Binary:   {entity['binary_representation']}")
            print()
            
            # Parse layers
            if 'layers' in entity:
                print("📋 LAYER ANALYSIS:")
                print("-" * 40)
                layers = entity['layers']
                for layer_name in ['Physical', 'Functional', 'Abstract', 'Social']:
                    if layer_name in layers:
                        hex_val = layers[layer_name]
                        binary = bin(int(hex_val, 16))[2:].zfill(8)
                        active = binary.count('1')
                        print(f"{layer_name:12} {hex_val}  [{binary}]  {active}/8 traits")
            
            # Show active traits
            if 'trait_evaluations' in entity:
                print()
                print("✅ ACTIVE TRAITS:")
                print("-" * 40)
                active_traits = [e for e in entity['trait_evaluations'] if e['applicable']]
                for eval in sorted(active_traits, key=lambda x: x['trait_bit']):
                    conf = eval['confidence'] * 100
                    print(f"Bit {eval['trait_bit']:2d}: {eval['trait_name']:<30} (Confidence: {conf:.0f}%)")
                
                print()
                print("❌ INACTIVE TRAITS:")
                print("-" * 40)
                inactive_traits = [e for e in entity['trait_evaluations'] if not e['applicable']]
                for eval in sorted(inactive_traits, key=lambda x: x['trait_bit'])[:5]:  # Show first 5
                    print(f"Bit {eval['trait_bit']:2d}: {eval['trait_name']}")
            
            print()
            print(f"⏱️  Processing time: {result['processing_time_ms']:.1f}ms")
            print(f"💾 UUID: {entity.get('uuid', 'N/A')}")
            
            return entity
            
        else:
            print(f"❌ Failed: {response.status_code}")
            print(response.json())
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    classify_smartphone()