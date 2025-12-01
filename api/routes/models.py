"""
API routes for model management and statistics.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional
import os
import logging

from workers.llm_client import OpenRouterClient, ModelSelector
from workers.model_benchmark import ModelBenchmark, run_lazy_benchmark

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_openrouter_client():
    """Dependency to get OpenRouter client"""
    try:
        return OpenRouterClient()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_model_stats(
    client: OpenRouterClient = Depends(get_openrouter_client)
) -> Dict[str, Any]:
    """
    Get statistics for all tracked models.

    Returns availability scores, quality scores, and selection metrics.
    """
    selector = client.selector

    # Get all tracked stats
    all_stats = selector.get_all_stats()

    # Get current best model
    try:
        free_models = await client._fetch_free_models()
        best_model = selector.select_best_model(free_models)
    except Exception as e:
        logger.error(f"Failed to get best model: {e}")
        best_model = None

    return {
        "current_best_model": best_model,
        "total_free_models": len(OpenRouterClient._available_free_models),
        "tracked_models": len(all_stats),
        "last_benchmark": ModelSelector._last_benchmark,
        "models": all_stats
    }


@router.get("/free")
async def list_free_models(
    client: OpenRouterClient = Depends(get_openrouter_client)
) -> Dict[str, Any]:
    """
    List all available free models from OpenRouter.
    """
    try:
        free_models = await client._fetch_free_models()

        # Add scores to each model
        models_with_scores = []
        for m in free_models:
            model_id = m["id"]
            context = m.get("context_length", 0)
            score = client.selector.calculate_score(model_id, context)
            is_available = client.selector.is_available(model_id)

            models_with_scores.append({
                "id": model_id,
                "context_length": context,
                "combined_score": round(score, 3),
                "is_available": is_available,
                "quality_score": ModelSelector._quality_scores.get(model_id),
                "top_provider": m.get("top_provider", {})
            })

        # Sort by score
        models_with_scores.sort(key=lambda x: -x["combined_score"])

        return {
            "total": len(models_with_scores),
            "models": models_with_scores
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/benchmark")
async def run_benchmark(
    background_tasks: BackgroundTasks,
    tests_per_model: int = 3,
    max_models: int = 5,
    client: OpenRouterClient = Depends(get_openrouter_client)
) -> Dict[str, Any]:
    """
    Run quality benchmarks on free models.

    This runs in the background and updates quality scores.
    """
    try:
        # Run benchmark in background
        async def run_benchmark_task():
            benchmark = ModelBenchmark(client)
            free_models = await client._fetch_free_models()

            results = await benchmark.benchmark_all_models(
                free_models[:max_models],
                tests_per_model=tests_per_model
            )

            # Log results
            for model_id, result in results.items():
                logger.info(
                    f"Benchmark {model_id}: {result.correct}/{result.total_tests} "
                    f"(score: {result.weighted_score:.2f})"
                )

        background_tasks.add_task(run_benchmark_task)

        return {
            "status": "started",
            "message": f"Benchmarking {max_models} models with {tests_per_model} tests each",
            "note": "Check /api/v1/models/stats for results after completion"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-stats")
async def reset_model_stats(
    client: OpenRouterClient = Depends(get_openrouter_client)
) -> Dict[str, Any]:
    """
    Reset all model statistics (for testing/debugging).
    """
    ModelSelector._model_stats.clear()
    ModelSelector._quality_scores.clear()
    ModelSelector._last_benchmark = None

    return {
        "status": "reset",
        "message": "All model statistics have been cleared"
    }


@router.get("/current")
async def get_current_model(
    client: OpenRouterClient = Depends(get_openrouter_client)
) -> Dict[str, Any]:
    """
    Get the currently selected best model and its stats.
    """
    try:
        free_models = await client._fetch_free_models()
        best_model = await client.get_best_free_model()

        # Get stats for this model
        stats = client.selector.get_stats(best_model)
        model_info = next((m for m in free_models if m["id"] == best_model), {})

        return {
            "model_id": best_model,
            "context_length": model_info.get("context_length", 0),
            "quality_score": ModelSelector._quality_scores.get(best_model),
            "availability_score": stats.availability_score(),
            "combined_score": client.selector.calculate_score(
                best_model, model_info.get("context_length", 0)
            ),
            "success_count": stats.success_count,
            "failure_count": stats.failure_count,
            "rate_limit_count": stats.rate_limit_count,
            "is_in_cooldown": not stats.is_available(),
            "alternatives_available": len([
                m for m in free_models
                if client.selector.is_available(m["id"]) and m["id"] != best_model
            ])
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
