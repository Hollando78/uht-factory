import httpx
import os
import asyncio
import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime
import base64
import uuid

logger = logging.getLogger(__name__)

# UHT Visual Identity - Clean, realistic illustration style
UHT_STYLE_PREFIX = """Clean, detailed illustration in a realistic style.
Natural lighting, accurate proportions, rich colors. Like a high-quality
encyclopedia or nature documentary still. Clear, informative, visually appealing."""

UHT_NEGATIVE = """Do NOT include any text, labels, words, letters, numbers, watermarks,
signatures, captions, UI elements, diagrams, or infographics. No writing of any kind.
Avoid surreal distortions, abstract shapes, psychedelic effects, or dream-like imagery.
No floating objects, impossible physics, or fantasy elements unless the subject requires it."""


def is_physical_entity(uht_code: str) -> bool:
    """Determine if entity is tangible based on UHT Bit 1 (Physical Object trait)"""
    if not uht_code or len(uht_code) < 8:
        return True  # Default to physical/literal depiction
    try:
        # Convert full 32-bit code to binary, check bit 1 (leftmost)
        binary = bin(int(uht_code, 16))[2:].zfill(32)
        return binary[0] == '1'  # Bit 1 = Physical Object
    except:
        return True


def build_uht_image_prompt(entity_name: str, description: str = "", uht_code: str = "") -> str:
    """
    Build a UHT-styled image prompt.

    Physical entities -> literal, realistic depiction
    Conceptual entities -> concrete scene showing the concept in action
    """
    # Truncate description to first sentence or 150 chars for more context
    brief_desc = ""
    if description:
        brief_desc = description.split('.')[0][:150].strip()
        if brief_desc and not brief_desc.endswith('.'):
            brief_desc += '.'

    if is_physical_entity(uht_code):
        # Tangible objects: show the actual thing realistically
        subject = f"A realistic depiction of: {entity_name}."
        if brief_desc:
            subject += f" {brief_desc}"
        composition = """Show this subject clearly and accurately. Use a clean,
simple background that doesn't distract. The subject should be immediately
recognizable and true to life. Good lighting, natural colors."""
    else:
        # Abstract concepts: show a concrete scene that demonstrates the concept
        subject = f"A scene depicting the concept of {entity_name} in action."
        if brief_desc:
            subject += f" Context: {brief_desc}"
        composition = """Show real people, places, or objects that illustrate this concept.
Use a specific, concrete scenario rather than abstract symbolism.
The viewer should understand what the concept means by looking at the scene.
Grounded in reality, like a documentary photograph or realistic illustration."""

    return f"{UHT_STYLE_PREFIX}\n\n{subject}\n\n{composition}\n\n{UHT_NEGATIVE}"


class GeminiImageClient:
    """Lightweight HTTP client for Gemini Flash image generation"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        self.model = "gemini-2.5-flash-image"  # Nano Banana - native image generation

        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")
    
    async def generate_image(
        self, 
        prompt: str, 
        entity_name: str = "",
        uht_code: str = "",
        active_traits: list = None
    ) -> Dict[str, Any]:
        """
        Generate an image using Gemini 2.5 Flash Image via direct HTTP API.
        
        Cost: $0.039 per image (1290 tokens × $30/1M tokens)
        """
        try:
            # Enhance prompt with UHT context
            enhanced_prompt = self._build_enhanced_prompt(
                prompt, entity_name, uht_code, active_traits or []
            )
            
            # Prepare request
            url = f"{self.base_url}/{self.model}:generateContent"
            headers = {
                "x-goog-api-key": self.api_key,
                "Content-Type": "application/json"
            }
            
            request_data = {
                "contents": [{
                    "parts": [{"text": enhanced_prompt}]
                }],
                "generationConfig": {
                    "responseModalities": ["IMAGE"]
                }
            }
            
            start_time = datetime.now()
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=request_data)
                
            generation_time_ms = (datetime.now() - start_time).total_seconds() * 1000
            
            if response.status_code != 200:
                error_detail = response.text if response.text else f"HTTP {response.status_code}"
                raise Exception(f"Gemini API error: {error_detail}")
            
            result = response.json()
            
            # Extract image data from response
            image_data = self._extract_image_data(result)
            
            return {
                "success": True,
                "image_data": image_data,
                "image_url": await self._save_image(image_data, entity_name),
                "prompt_used": enhanced_prompt,
                "generation_time_ms": round(generation_time_ms, 1),
                "cost_usd": 0.039,  # Fixed cost for Gemini 2.5 Flash Image
                "model_used": self.model,
                "created_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "image_data": None,
                "image_url": None,
                "prompt_used": enhanced_prompt if 'enhanced_prompt' in locals() else prompt,
                "generation_time_ms": 0,
                "cost_usd": 0,
                "model_used": self.model,
                "created_at": datetime.utcnow().isoformat()
            }
    
    def _build_enhanced_prompt(
        self,
        base_prompt: str,
        entity_name: str,
        uht_code: str,
        active_traits: list
    ) -> str:
        """Build an enhanced prompt with UHT visual style"""
        # Use the new UHT prompt builder
        return build_uht_image_prompt(entity_name, base_prompt, uht_code)
    
    def _analyze_uht_layers(self, uht_code: str) -> Dict[str, int]:
        """Analyze UHT code to determine layer trait counts"""
        try:
            # Split 8-char hex into 4 2-char layer codes
            physical = uht_code[:2]
            functional = uht_code[2:4]
            abstract = uht_code[4:6]
            social = uht_code[6:8]
            
            return {
                "Physical": bin(int(physical, 16))[2:].count('1'),
                "Functional": bin(int(functional, 16))[2:].count('1'),
                "Abstract": bin(int(abstract, 16))[2:].count('1'),
                "Social": bin(int(social, 16))[2:].count('1')
            }
        except:
            return {"Physical": 0, "Functional": 0, "Abstract": 0, "Social": 0}
    
    def _extract_image_data(self, api_response: Dict[str, Any]) -> Optional[str]:
        """Extract base64 image data from Gemini API response"""
        try:
            # Navigate Gemini API response structure
            if "candidates" in api_response and len(api_response["candidates"]) > 0:
                candidate = api_response["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    for part in parts:
                        # Check for inlineData (camelCase)
                        if "inlineData" in part:
                            return part["inlineData"]["data"]
                        # Also check for inline_data (snake_case) for backwards compatibility
                        if "inline_data" in part:
                            return part["inline_data"]["data"]
            return None
        except Exception as e:
            logger.error(f"Failed to extract image data: {e}")
            return None
    
    async def _save_image(self, image_data: str, entity_name: str) -> Optional[str]:
        """Save base64 image data to file and return URL"""
        if not image_data:
            return None
            
        try:
            # Create images directory if it doesn't exist
            images_dir = "static/images"
            os.makedirs(images_dir, exist_ok=True)
            
            # Generate unique filename
            safe_name = "".join(c for c in entity_name if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_name = safe_name.replace(' ', '_')[:50]  # Limit length
            filename = f"{safe_name}_{uuid.uuid4().hex[:8]}.png"
            filepath = os.path.join(images_dir, filename)
            
            # Decode and save image
            image_bytes = base64.b64decode(image_data)
            with open(filepath, 'wb') as f:
                f.write(image_bytes)
            
            # Return relative URL
            return f"/static/images/{filename}"
            
        except Exception as e:
            logger.error(f"Failed to save image: {e}")
            return None

class SVGPlaceholderClient:
    """Generate SVG placeholder images based on UHT traits (free, no API required)"""

    LAYER_COLORS = {
        "Physical": "#FF6B35",
        "Functional": "#00E5FF",
        "Abstract": "#9C27B0",
        "Social": "#4CAF50"
    }

    def _analyze_uht_layers(self, uht_code: str) -> Dict[str, int]:
        """Analyze UHT code to determine layer trait counts"""
        try:
            physical = uht_code[:2]
            functional = uht_code[2:4]
            abstract = uht_code[4:6]
            social = uht_code[6:8]

            return {
                "Physical": bin(int(physical, 16))[2:].count('1'),
                "Functional": bin(int(functional, 16))[2:].count('1'),
                "Abstract": bin(int(abstract, 16))[2:].count('1'),
                "Social": bin(int(social, 16))[2:].count('1')
            }
        except:
            return {"Physical": 0, "Functional": 0, "Abstract": 0, "Social": 0}

    def _get_dominant_layer(self, uht_code: str) -> str:
        """Get the dominant layer from UHT code"""
        layers = self._analyze_uht_layers(uht_code)
        if not layers or all(v == 0 for v in layers.values()):
            return "Physical"
        return max(layers.items(), key=lambda x: x[1])[0]

    def generate_svg(self, entity_name: str, uht_code: str, dominant_layer: str = None) -> str:
        """Generate an SVG placeholder for an entity."""
        if not dominant_layer:
            dominant_layer = self._get_dominant_layer(uht_code)

        color = self.LAYER_COLORS.get(dominant_layer, "#757575")

        # Truncate name for display
        display_name = entity_name[:24] + "..." if len(entity_name) > 24 else entity_name

        # Generate trait count indicator bars
        layers = self._analyze_uht_layers(uht_code)
        total_traits = sum(layers.values())

        # Create visual trait bars
        bar_width = 100
        bars_svg = ""
        y_offset = 380
        for layer_name, count in layers.items():
            layer_color = self.LAYER_COLORS.get(layer_name, "#757575")
            filled_width = (count / 8) * bar_width  # 8 traits per layer
            bars_svg += f'''
            <rect x="{256 - bar_width/2}" y="{y_offset}" width="{bar_width}" height="8" fill="#333" rx="2"/>
            <rect x="{256 - bar_width/2}" y="{y_offset}" width="{filled_width}" height="8" fill="{layer_color}" rx="2"/>
            <text x="{256 + bar_width/2 + 10}" y="{y_offset + 7}" fill="#666" font-size="10" font-family="sans-serif">{layer_name[0]}</text>
            '''
            y_offset += 16

        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" fill="url(#bg-grad)"/>

  <!-- Decorative border -->
  <rect x="16" y="16" width="480" height="480" rx="24" fill="none" stroke="{color}" stroke-width="2" opacity="0.6"/>
  <rect x="24" y="24" width="464" height="464" rx="20" fill="none" stroke="{color}" stroke-width="1" opacity="0.3"/>

  <!-- UHT Code (prominent) -->
  <text x="256" y="160" text-anchor="middle" fill="{color}" font-size="64" font-family="monospace" font-weight="bold" filter="url(#glow)">{uht_code}</text>

  <!-- Hex prefix -->
  <text x="256" y="100" text-anchor="middle" fill="#666" font-size="14" font-family="monospace">UHT CODE</text>

  <!-- Entity name -->
  <text x="256" y="240" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif">{display_name}</text>

  <!-- Layer badge -->
  <rect x="180" y="270" width="152" height="32" rx="16" fill="{color}" opacity="0.2"/>
  <text x="256" y="292" text-anchor="middle" fill="{color}" font-size="14" font-family="sans-serif" font-weight="bold">{dominant_layer} Layer</text>

  <!-- Trait count -->
  <text x="256" y="340" text-anchor="middle" fill="#888" font-size="12" font-family="sans-serif">{total_traits} active traits</text>

  <!-- Layer bars -->
  {bars_svg}

  <!-- Footer -->
  <text x="256" y="480" text-anchor="middle" fill="#444" font-size="10" font-family="sans-serif">Generated by UHT Factory • Free Mode</text>
</svg>'''

        return svg

    async def generate_image(
        self,
        prompt: str,
        entity_name: str = "",
        uht_code: str = "00000000",
        active_traits: list = None
    ) -> Dict[str, Any]:
        """Generate SVG placeholder image (API-compatible interface)"""

        start_time = datetime.now()
        dominant_layer = self._get_dominant_layer(uht_code)

        svg_content = self.generate_svg(entity_name, uht_code, dominant_layer)

        # Save SVG to file
        image_url = await self._save_svg(svg_content, entity_name, uht_code)

        generation_time_ms = (datetime.now() - start_time).total_seconds() * 1000

        return {
            "success": True,
            "image_data": svg_content,
            "image_url": image_url,
            "prompt_used": f"SVG placeholder for {entity_name}",
            "generation_time_ms": round(generation_time_ms, 1),
            "cost_usd": 0.0,  # Free!
            "model_used": "svg-placeholder",
            "created_at": datetime.utcnow().isoformat()
        }

    async def _save_svg(self, svg_content: str, entity_name: str, uht_code: str) -> Optional[str]:
        """Save SVG content to file and return URL"""
        try:
            images_dir = "static/images"
            os.makedirs(images_dir, exist_ok=True)

            # Generate filename from UHT code
            safe_name = "".join(c for c in entity_name if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_name = safe_name.replace(' ', '_')[:30]
            filename = f"{safe_name}_{uht_code}.svg"
            filepath = os.path.join(images_dir, filename)

            with open(filepath, 'w') as f:
                f.write(svg_content)

            return f"/static/images/{filename}"

        except Exception as e:
            logger.error(f"Failed to save SVG: {e}")
            return None


class ImageGenerationOrchestrator:
    """Orchestrates image generation for UHT entities"""

    def __init__(self):
        # Select client based on IMAGE_PROVIDER environment variable
        provider = os.getenv("IMAGE_PROVIDER", "gemini").lower()

        if provider == "svg":
            logger.info("Using SVG placeholder client (free mode)")
            self.client = SVGPlaceholderClient()
        else:
            logger.info(f"Using Gemini image client")
            self.client = GeminiImageClient()
    
    async def generate_entity_image(
        self,
        entity: Dict[str, Any],
        custom_prompt: str = None
    ) -> Dict[str, Any]:
        """Generate an image for a classified UHT entity"""

        entity_name = entity.get("name", "Unknown Entity")
        uht_code = entity.get("uht_code", "00000000")
        description = entity.get("description", "")

        # Extract active traits if available
        active_traits = []
        if "trait_evaluations" in entity:
            active_traits = [
                t["trait_name"] for t in entity["trait_evaluations"]
                if t.get("applicable", False)
            ]

        # Use custom prompt or generate UHT-styled prompt
        if custom_prompt:
            prompt = custom_prompt
        else:
            prompt = build_uht_image_prompt(entity_name, description, uht_code)

        return await self.client.generate_image(
            prompt=prompt,
            entity_name=entity_name,
            uht_code=uht_code,
            active_traits=active_traits
        )
    
    async def generate_batch_images(
        self, 
        entities: list, 
        max_concurrent: int = 3
    ) -> list:
        """Generate images for multiple entities with concurrency control"""
        
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def generate_single(entity):
            async with semaphore:
                return await self.generate_entity_image(entity)
        
        tasks = [generate_single(entity) for entity in entities]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return results