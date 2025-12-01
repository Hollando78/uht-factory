#!/usr/bin/env python3
"""
Model configuration manager for UHT Classification Factory
"""
import os
import sys

def update_env_file(key, value):
    """Update a key in the .env file"""
    env_path = "/root/project/uht-factory/.env"
    
    # Read current content
    with open(env_path, 'r') as f:
        lines = f.readlines()
    
    # Update the specific key
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            updated = True
            break
    
    # Add if not found
    if not updated:
        # Find LLM configuration section
        for i, line in enumerate(lines):
            if "# LLM Configuration" in line:
                lines.insert(i + 2, f"{key}={value}\n")
                break
    
    # Write back
    with open(env_path, 'w') as f:
        f.writelines(lines)

def configure_model(model_choice=None):
    """Configure OpenAI model for classification"""
    
    models = {
        "1": ("gpt-4o-mini", "$0.0036", "Best value - 98% cheaper, better than GPT-3.5"),
        "2": ("gpt-3.5-turbo", "$0.0104", "Budget option - 95% cheaper, reliable"),
        "3": ("gpt-4o", "$0.0600", "Premium fast - 71% cheaper, excellent quality"),
        "4": ("gpt-4-turbo-preview", "$0.2080", "High accuracy - current default"),
        "5": ("gpt-4", "$0.5280", "Maximum quality - most expensive"),
    }
    
    print("🤖 UHT Classification Factory - Model Configuration")
    print("=" * 60)
    
    if not model_choice:
        print("\nAvailable OpenAI Models:")
        print("-" * 60)
        for key, (model, cost, desc) in models.items():
            print(f"{key}. {model:<20} {cost:<10} {desc}")
        
        print("\nCurrent model: " + os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
        print()
        model_choice = input("Select model (1-5) or press Enter to keep current: ").strip()
    
    if model_choice and model_choice in models:
        model_id, cost, desc = models[model_choice]
        
        # Update .env file
        update_env_file("OPENAI_MODEL", model_id)
        
        print(f"\n✅ Model updated to: {model_id}")
        print(f"💰 Cost per classification: {cost}")
        print(f"📝 {desc}")
        
        # Calculate monthly costs
        daily_rates = [10, 100, 1000]
        cost_val = float(cost.replace("$", ""))
        
        print("\n📊 Estimated Monthly Costs:")
        for rate in daily_rates:
            monthly_cost = rate * 30 * cost_val
            print(f"  • {rate:>4}/day: ${monthly_cost:>8,.2f}/month")
        
        print("\n⚠️  Note: Server will auto-reload with new model")
        print("🔄 Clear Redis cache to test with new model:")
        print("   docker exec uht-redis redis-cli FLUSHALL")
        
    else:
        print("No changes made.")

if __name__ == "__main__":
    # Allow command line argument
    model = sys.argv[1] if len(sys.argv) > 1 else None
    configure_model(model)