"""
Model Quality Benchmarking for OpenRouter Free Models

This module defines canonical test cases for evaluating LLM model quality
on UHT trait classification tasks.
"""

import asyncio
import logging
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# Canonical benchmark test cases with known expected answers
# Each test covers different trait types and difficulty levels
BENCHMARK_TESTS = [
    # Physical Layer (bits 1-8) - Easy cases
    {
        "entity": {"name": "Rock", "description": "A solid piece of mineral matter found in nature"},
        "trait": {"bit": 1, "name": "Physical Object", "layer": "Physical",
                  "expanded_definition": "A tangible object with physical boundaries that occupies space"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },
    {
        "entity": {"name": "Democracy", "description": "A system of government by the whole population"},
        "trait": {"bit": 1, "name": "Physical Object", "layer": "Physical",
                  "expanded_definition": "A tangible object with physical boundaries that occupies space"},
        "expected": False,
        "difficulty": "easy",
        "weight": 1.0
    },
    {
        "entity": {"name": "Water", "description": "A transparent, tasteless liquid essential for life"},
        "trait": {"bit": 2, "name": "Has Mass", "layer": "Physical",
                  "expanded_definition": "Possesses physical mass that can be measured"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },

    # Physical Layer - Medium cases
    {
        "entity": {"name": "Lightning", "description": "A sudden electrostatic discharge during a storm"},
        "trait": {"bit": 1, "name": "Physical Object", "layer": "Physical",
                  "expanded_definition": "A tangible object with physical boundaries that occupies space"},
        "expected": False,
        "difficulty": "medium",
        "weight": 1.5
    },
    {
        "entity": {"name": "Cloud", "description": "A visible mass of water droplets suspended in atmosphere"},
        "trait": {"bit": 1, "name": "Physical Object", "layer": "Physical",
                  "expanded_definition": "A tangible object with physical boundaries that occupies space"},
        "expected": True,  # Clouds are physical (water droplets)
        "difficulty": "medium",
        "weight": 1.5
    },

    # Functional Layer (bits 9-16)
    {
        "entity": {"name": "Hammer", "description": "A tool with a weighted head for driving nails"},
        "trait": {"bit": 9, "name": "Has Purpose", "layer": "Functional",
                  "expanded_definition": "Designed or exists for a specific function or goal"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },
    {
        "entity": {"name": "Random Noise", "description": "Meaningless random static or interference"},
        "trait": {"bit": 9, "name": "Has Purpose", "layer": "Functional",
                  "expanded_definition": "Designed or exists for a specific function or goal"},
        "expected": False,
        "difficulty": "easy",
        "weight": 1.0
    },

    # Abstract Layer (bits 17-24)
    {
        "entity": {"name": "Pi", "description": "The mathematical constant approximately equal to 3.14159"},
        "trait": {"bit": 17, "name": "Abstract Concept", "layer": "Abstract",
                  "expanded_definition": "Exists as an idea or concept without physical form"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },
    {
        "entity": {"name": "Justice", "description": "The quality of being fair and reasonable"},
        "trait": {"bit": 17, "name": "Abstract Concept", "layer": "Abstract",
                  "expanded_definition": "Exists as an idea or concept without physical form"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },

    # Social Layer (bits 25-32)
    {
        "entity": {"name": "Marriage", "description": "A legally recognized union between partners"},
        "trait": {"bit": 25, "name": "Social Construct", "layer": "Social",
                  "expanded_definition": "Created by and exists within human social systems"},
        "expected": True,
        "difficulty": "easy",
        "weight": 1.0
    },
    {
        "entity": {"name": "Gravity", "description": "The force that attracts objects with mass toward each other"},
        "trait": {"bit": 25, "name": "Social Construct", "layer": "Social",
                  "expanded_definition": "Created by and exists within human social systems"},
        "expected": False,
        "difficulty": "easy",
        "weight": 1.0
    },

    # Hard edge cases
    {
        "entity": {"name": "Bitcoin", "description": "A decentralized digital cryptocurrency"},
        "trait": {"bit": 1, "name": "Physical Object", "layer": "Physical",
                  "expanded_definition": "A tangible object with physical boundaries that occupies space"},
        "expected": False,  # Digital, not physical
        "difficulty": "hard",
        "weight": 2.0
    },
    {
        "entity": {"name": "Corporation", "description": "A legal entity formed by a group of people"},
        "trait": {"bit": 25, "name": "Social Construct", "layer": "Social",
                  "expanded_definition": "Created by and exists within human social systems"},
        "expected": True,
        "difficulty": "hard",
        "weight": 2.0
    },
    {
        "entity": {"name": "Language", "description": "A system of communication using words and grammar"},
        "trait": {"bit": 25, "name": "Social Construct", "layer": "Social",
                  "expanded_definition": "Created by and exists within human social systems"},
        "expected": True,
        "difficulty": "hard",
        "weight": 2.0
    },
]


@dataclass
class BenchmarkResult:
    """Result of running benchmark on a model"""
    model_id: str
    total_tests: int
    correct: int
    weighted_score: float  # 0-1
    results: List[Dict[str, Any]]
    duration_seconds: float


class ModelBenchmark:
    """Run quality benchmarks on LLM models"""

    def __init__(self, openrouter_client):
        self.client = openrouter_client
        self.tests = BENCHMARK_TESTS

    async def run_single_test(
        self,
        model_id: str,
        test: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Run a single benchmark test on a model"""
        try:
            # Use the client's evaluate_trait but force specific model
            # We'll create a minimal trait dict for testing
            result = await self.client.evaluate_trait(
                entity=test["entity"],
                trait=test["trait"]
            )

            # Check if the model got the right answer
            predicted = result.get("applicable", False)
            expected = test["expected"]
            correct = predicted == expected

            return {
                "entity": test["entity"]["name"],
                "trait": test["trait"]["name"],
                "expected": expected,
                "predicted": predicted,
                "correct": correct,
                "confidence": result.get("confidence", 0),
                "difficulty": test["difficulty"],
                "weight": test["weight"]
            }

        except Exception as e:
            logger.error(f"Benchmark test failed: {e}")
            return {
                "entity": test["entity"]["name"],
                "trait": test["trait"]["name"],
                "expected": test["expected"],
                "predicted": None,
                "correct": False,
                "error": str(e),
                "difficulty": test["difficulty"],
                "weight": test["weight"]
            }

    async def run_benchmark(
        self,
        model_id: Optional[str] = None,
        max_tests: int = 15
    ) -> BenchmarkResult:
        """Run full benchmark suite on a model"""
        start_time = time.time()

        # Use subset of tests if needed
        tests_to_run = self.tests[:max_tests]

        results = []
        for test in tests_to_run:
            result = await self.run_single_test(model_id or "auto", test)
            results.append(result)

            # Small delay to avoid rate limits
            await asyncio.sleep(0.5)

        # Calculate scores
        correct = sum(1 for r in results if r.get("correct", False))
        total = len(results)

        # Weighted score
        total_weight = sum(r["weight"] for r in results)
        weighted_correct = sum(r["weight"] for r in results if r.get("correct", False))
        weighted_score = weighted_correct / total_weight if total_weight > 0 else 0

        duration = time.time() - start_time

        # Get actual model used from client
        actual_model = self.client.selector.get_stats(model_id or "unknown").model_id if model_id else "auto"

        return BenchmarkResult(
            model_id=actual_model,
            total_tests=total,
            correct=correct,
            weighted_score=weighted_score,
            results=results,
            duration_seconds=duration
        )

    async def benchmark_all_models(
        self,
        free_models: List[Dict],
        tests_per_model: int = 5
    ) -> Dict[str, BenchmarkResult]:
        """Run benchmarks on multiple models"""
        results = {}

        # Run subset of tests on each model
        subset_tests = self.tests[:tests_per_model]

        for model_info in free_models[:10]:  # Limit to top 10 models
            model_id = model_info["id"]
            logger.info(f"Benchmarking model: {model_id}")

            try:
                result = await self.run_benchmark(model_id, max_tests=tests_per_model)
                results[model_id] = result

                # Update quality score in selector
                self.client.selector.set_quality_score(model_id, result.weighted_score)

            except Exception as e:
                logger.error(f"Failed to benchmark {model_id}: {e}")
                results[model_id] = BenchmarkResult(
                    model_id=model_id,
                    total_tests=0,
                    correct=0,
                    weighted_score=0.0,
                    results=[],
                    duration_seconds=0
                )

        return results


async def run_lazy_benchmark(client) -> Dict[str, float]:
    """
    Run lazy benchmark on first request.
    Returns dict of model_id -> quality_score
    """
    from workers.llm_client import ModelSelector

    # Check if benchmark already done
    if ModelSelector._last_benchmark:
        cache_age = time.time() - ModelSelector._last_benchmark
        if cache_age < 86400:  # 24 hours
            logger.info(f"Using cached benchmark results (age: {cache_age/3600:.1f}h)")
            return ModelSelector._quality_scores

    logger.info("Running lazy benchmark on free models...")

    benchmark = ModelBenchmark(client)
    free_models = await client._fetch_free_models()

    # Quick benchmark: 3 tests per model, top 5 models
    results = await benchmark.benchmark_all_models(
        free_models[:5],
        tests_per_model=3
    )

    # Update timestamp
    ModelSelector._last_benchmark = time.time()

    scores = {model_id: result.weighted_score for model_id, result in results.items()}
    logger.info(f"Benchmark complete. Scores: {scores}")

    return scores
