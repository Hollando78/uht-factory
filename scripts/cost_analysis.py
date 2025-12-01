#!/usr/bin/env python3
"""
Cost analysis for UHT Classification Factory
"""

def calculate_classification_cost():
    """Calculate the cost of a single entity classification"""
    
    print("💰 UHT Classification Factory - Cost Analysis")
    print("=" * 60)
    
    # OpenAI GPT-4 Turbo pricing (as of 2024)
    # Input: $0.01 per 1K tokens
    # Output: $0.03 per 1K tokens
    input_cost_per_1k = 0.01
    output_cost_per_1k = 0.03
    
    # Estimate tokens per trait evaluation
    # System prompt (~200 tokens) + entity description (~50 tokens) + trait context (~100 tokens)
    avg_input_tokens_per_trait = 350
    # Response JSON with justification (~100 tokens)
    avg_output_tokens_per_trait = 100
    
    # Total for 32 traits
    total_input_tokens = avg_input_tokens_per_trait * 32
    total_output_tokens = avg_output_tokens_per_trait * 32
    
    # Calculate costs
    input_cost = (total_input_tokens / 1000) * input_cost_per_1k
    output_cost = (total_output_tokens / 1000) * output_cost_per_1k
    total_cost = input_cost + output_cost
    
    print("📊 Token Usage per Classification:")
    print(f"  • Input tokens per trait:  ~{avg_input_tokens_per_trait} tokens")
    print(f"  • Output tokens per trait: ~{avg_output_tokens_per_trait} tokens")
    print(f"  • Total traits evaluated:  32")
    print()
    print(f"  📥 Total input tokens:  {total_input_tokens:,} tokens")
    print(f"  📤 Total output tokens: {total_output_tokens:,} tokens")
    print(f"  📊 Total tokens:        {total_input_tokens + total_output_tokens:,} tokens")
    print()
    print("💵 Cost Breakdown (GPT-4 Turbo):")
    print(f"  • Input cost:  ${input_cost:.3f}")
    print(f"  • Output cost: ${output_cost:.3f}")
    print(f"  • TOTAL COST:  ${total_cost:.3f} per classification")
    print()
    
    # Cost optimizations
    print("💡 Cost Optimization Strategies:")
    print("=" * 60)
    
    # GPT-3.5 Turbo pricing
    gpt35_input_cost_per_1k = 0.0005
    gpt35_output_cost_per_1k = 0.0015
    gpt35_input_cost = (total_input_tokens / 1000) * gpt35_input_cost_per_1k
    gpt35_output_cost = (total_output_tokens / 1000) * gpt35_output_cost_per_1k
    gpt35_total = gpt35_input_cost + gpt35_output_cost
    
    print("1. Use GPT-3.5 Turbo instead of GPT-4:")
    print(f"   • Cost per classification: ${gpt35_total:.3f}")
    print(f"   • Savings: ${total_cost - gpt35_total:.3f} (%.0f%% cheaper)" % ((1 - gpt35_total/total_cost) * 100))
    print()
    
    # Reduced parallel calls
    print("2. Layer-based evaluation (4 calls instead of 32):")
    layer_tokens = total_input_tokens / 8  # 4 layers instead of 32 traits
    layer_cost = (layer_tokens / 1000) * input_cost_per_1k + (total_output_tokens / 1000) * output_cost_per_1k
    print(f"   • Cost per classification: ${layer_cost:.3f}")
    print(f"   • Savings: ${total_cost - layer_cost:.3f} (%.0f%% cheaper)" % ((1 - layer_cost/total_cost) * 100))
    print()
    
    # Caching
    print("3. Caching strategy:")
    cache_hit_rate = 0.7  # 70% cache hit rate
    effective_cost = total_cost * (1 - cache_hit_rate)
    print(f"   • With 70% cache hit rate: ${effective_cost:.3f} effective cost")
    print(f"   • Savings: ${total_cost - effective_cost:.3f} per cached hit")
    print()
    
    # Batch processing
    print("4. Batch processing (shared context):")
    batch_size = 10
    batch_input_tokens = avg_input_tokens_per_trait * 32 * batch_size * 0.6  # 40% token reduction
    batch_cost = (batch_input_tokens / 1000) * input_cost_per_1k + (total_output_tokens * batch_size / 1000) * output_cost_per_1k
    batch_cost_per_entity = batch_cost / batch_size
    print(f"   • Cost per entity in batch: ${batch_cost_per_entity:.3f}")
    print(f"   • Savings: ${total_cost - batch_cost_per_entity:.3f} (%.0f%% cheaper)" % ((1 - batch_cost_per_entity/total_cost) * 100))
    print()
    
    # Monthly estimates
    print("📈 Usage Projections:")
    print("=" * 60)
    classifications_per_day = [10, 100, 1000]
    
    for daily in classifications_per_day:
        monthly = daily * 30
        monthly_cost = monthly * total_cost
        monthly_cost_optimized = monthly * gpt35_total * (1 - cache_hit_rate)
        
        print(f"\n{daily:,} classifications/day ({monthly:,}/month):")
        print(f"  • GPT-4 (no cache):        ${monthly_cost:,.2f}/month")
        print(f"  • GPT-3.5 (70% cache):     ${monthly_cost_optimized:,.2f}/month")
    
    print()
    print("🔧 Recommended Production Configuration:")
    print("=" * 60)
    print("1. Use GPT-3.5 Turbo for most classifications")
    print("2. Reserve GPT-4 for high-value or ambiguous entities")
    print("3. Implement aggressive caching (Redis)")
    print("4. Batch similar entities together")
    print("5. Consider pre-filtering obvious traits")
    print("6. Use confidence thresholds to skip uncertain evaluations")
    
    return total_cost

if __name__ == "__main__":
    cost = calculate_classification_cost()
    print()
    print(f"✅ Current cost per classification: ${cost:.3f}")