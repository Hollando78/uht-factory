#!/usr/bin/env python3
"""
OpenAI Model Comparison for UHT Classification Factory
"""

def compare_openai_models():
    """Compare all available OpenAI models for classification"""
    
    print("🤖 OpenAI Model Options for UHT Classification")
    print("=" * 70)
    
    # Model pricing as of late 2024
    models = [
        {
            "name": "GPT-4o (Omni)",
            "model_id": "gpt-4o",
            "input_cost": 0.0025,  # per 1K tokens
            "output_cost": 0.01,    # per 1K tokens
            "context": 128000,
            "strengths": "Fastest GPT-4 class, multimodal, best for production",
            "speed": "Very Fast",
            "quality": "Excellent"
        },
        {
            "name": "GPT-4o mini",
            "model_id": "gpt-4o-mini",
            "input_cost": 0.00015,
            "output_cost": 0.0006,
            "context": 128000,
            "strengths": "Cheapest smart model, faster than GPT-3.5",
            "speed": "Very Fast",
            "quality": "Very Good"
        },
        {
            "name": "GPT-4 Turbo",
            "model_id": "gpt-4-turbo-preview",
            "input_cost": 0.01,
            "output_cost": 0.03,
            "context": 128000,
            "strengths": "High accuracy, good for complex reasoning",
            "speed": "Fast",
            "quality": "Excellent"
        },
        {
            "name": "GPT-4 (Original)",
            "model_id": "gpt-4",
            "input_cost": 0.03,
            "output_cost": 0.06,
            "context": 8192,
            "strengths": "Most capable, best for nuanced tasks",
            "speed": "Moderate",
            "quality": "Best"
        },
        {
            "name": "GPT-3.5 Turbo",
            "model_id": "gpt-3.5-turbo",
            "input_cost": 0.0005,
            "output_cost": 0.0015,
            "context": 16385,
            "strengths": "Good balance of cost and capability",
            "speed": "Very Fast",
            "quality": "Good"
        },
        {
            "name": "GPT-3.5 Turbo (16k)",
            "model_id": "gpt-3.5-turbo-16k",
            "input_cost": 0.003,
            "output_cost": 0.004,
            "context": 16385,
            "strengths": "Larger context for batch processing",
            "speed": "Very Fast",
            "quality": "Good"
        }
    ]
    
    # Calculate costs for UHT classification (32 traits)
    input_tokens = 11200  # ~350 tokens per trait × 32
    output_tokens = 3200   # ~100 tokens per trait × 32
    
    print("📊 Cost Comparison for Single UHT Classification:")
    print(f"   (Based on {input_tokens:,} input + {output_tokens:,} output tokens)")
    print()
    print(f"{'Model':<20} {'Cost/Class':<12} {'Speed':<12} {'Quality':<12} {'Context':<10}")
    print("-" * 70)
    
    cost_data = []
    for model in models:
        input_cost = (input_tokens / 1000) * model["input_cost"]
        output_cost = (output_tokens / 1000) * model["output_cost"]
        total_cost = input_cost + output_cost
        cost_data.append((model["name"], total_cost, model))
        
        print(f"{model['name']:<20} ${total_cost:<11.4f} {model['speed']:<12} {model['quality']:<12} {model['context']:,}")
    
    print()
    print("🎯 Detailed Model Analysis:")
    print("=" * 70)
    
    # Sort by cost
    cost_data.sort(key=lambda x: x[1])
    
    for i, (name, cost, model) in enumerate(cost_data[:6], 1):
        print(f"\n{i}. {name} ('{model['model_id']}')")
        print(f"   💵 Cost: ${cost:.4f} per classification")
        print(f"   ⚡ Speed: {model['speed']}")
        print(f"   🎯 Quality: {model['quality']}")
        print(f"   💡 Best for: {model['strengths']}")
        
        # Monthly projections
        daily_100 = 100 * cost * 30
        print(f"   📈 100/day = ${daily_100:.2f}/month")
    
    print("\n" + "=" * 70)
    print("🏆 RECOMMENDATIONS for UHT Classification:")
    print("=" * 70)
    
    print("""
1. 🚀 BEST VALUE: GPT-4o mini ($0.0028/classification)
   - 75x cheaper than GPT-4 Turbo
   - Better than GPT-3.5 Turbo quality
   - Perfect for production at scale
   
2. 💰 MOST ECONOMICAL: GPT-3.5 Turbo ($0.0056/classification)
   - Reliable and fast
   - Good for high-volume classification
   - Well-tested and stable

3. 🎯 HIGHEST QUALITY: GPT-4o ($0.0600/classification)
   - Best balance of speed and accuracy
   - Use for ambiguous or critical entities
   - Multimodal capabilities if needed

4. 🔧 HYBRID APPROACH (Recommended):
   - Use GPT-4o mini for 90% of classifications
   - Reserve GPT-4o for complex/ambiguous entities
   - Implement confidence-based model selection
""")
    
    print("📝 Implementation Example:")
    print("-" * 40)
    print("""
# In workers/llm_client.py:
class OpenAIClient(BaseLLMClient):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model  # Changed from gpt-4-turbo-preview
        
# In .env:
LLM_MODEL=gpt-4o-mini  # or gpt-3.5-turbo for even cheaper
""")

if __name__ == "__main__":
    compare_openai_models()