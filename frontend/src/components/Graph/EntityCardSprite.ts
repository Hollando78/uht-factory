import * as THREE from 'three';

const LAYER_COLORS: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

interface EntityNodeData {
  id: string;
  name: string;
  uht_code?: string;
  image_url?: string;
  layer_dominance?: string;
  trait_count?: number;
  is_center?: boolean;
}

// Cache for loaded images
const imageCache = new Map<string, HTMLImageElement>();

// Cache for created sprites to avoid recreation
const spriteCache = new Map<string, THREE.Sprite>();

// Domains that need proxying due to CORS
const PROXY_DOMAINS = [
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'www.wikidata.org'
];

// Get proxied URL for external images
function getProxiedUrl(url: string): string {
  if (!url) return url;

  // Local URLs don't need proxying
  if (url.startsWith('/') || url.startsWith('data:')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (PROXY_DOMAINS.includes(parsed.hostname)) {
      return `/api/v1/images/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url;
}

// Load image with caching
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;

  // Use proxied URL for external images
  const actualUrl = getProxiedUrl(url);

  if (imageCache.has(actualUrl)) {
    return imageCache.get(actualUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    // Only set crossOrigin for non-proxied URLs
    if (!actualUrl.startsWith('/api/')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      imageCache.set(actualUrl, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = actualUrl;
  });
}

// Render entity card to canvas
function renderCardToCanvas(
  entity: EntityNodeData,
  image: HTMLImageElement | null,
  isHovered: boolean = false
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = 2; // For high DPI
  const width = 160 * scale;
  const height = 100 * scale;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const cardWidth = 160;
  const cardHeight = 100;

  // Background with rounded corners
  const borderRadius = 8;
  ctx.beginPath();
  ctx.roundRect(0, 0, cardWidth, cardHeight, borderRadius);
  ctx.fillStyle = entity.is_center
    ? 'rgba(0, 229, 255, 0.15)'
    : 'rgba(26, 26, 26, 0.95)';
  ctx.fill();

  // Border
  ctx.strokeStyle = entity.is_center
    ? 'rgba(0, 229, 255, 0.8)'
    : isHovered
      ? 'rgba(255, 255, 255, 0.5)'
      : 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = entity.is_center ? 2 : 1;
  ctx.stroke();

  // Image section (left side)
  const imgSize = 60;
  const imgX = 8;
  const imgY = 8;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(imgX, imgY, imgSize, imgSize, 4);
  ctx.clip();

  if (image) {
    // Draw image covering the area
    const aspectRatio = image.width / image.height;
    let drawWidth = imgSize;
    let drawHeight = imgSize;
    let drawX = imgX;
    let drawY = imgY;

    if (aspectRatio > 1) {
      drawWidth = imgSize * aspectRatio;
      drawX = imgX - (drawWidth - imgSize) / 2;
    } else {
      drawHeight = imgSize / aspectRatio;
      drawY = imgY - (drawHeight - imgSize) / 2;
    }

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  } else {
    // Placeholder with initial
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entity.name?.[0] || '?', imgX + imgSize/2, imgY + imgSize/2);
  }
  ctx.restore();

  // Text section (right side)
  const textX = imgX + imgSize + 8;
  const textWidth = cardWidth - textX - 8;

  // Name (truncated)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let name = entity.name || 'Unknown';
  if (ctx.measureText(name).width > textWidth) {
    while (ctx.measureText(name + '...').width > textWidth && name.length > 0) {
      name = name.slice(0, -1);
    }
    name += '...';
  }
  ctx.fillText(name, textX, imgY);

  // UHT Code
  if (entity.uht_code) {
    ctx.fillStyle = '#00E5FF';
    ctx.font = '10px monospace';
    ctx.fillText(entity.uht_code, textX, imgY + 16);
  }

  // Layer chip
  const layer = entity.layer_dominance || 'Physical';
  const layerColor = LAYER_COLORS[layer] || '#666';
  const chipY = imgY + 32;
  const chipText = layer;
  ctx.font = '9px Arial';
  const chipWidth = ctx.measureText(chipText).width + 10;

  ctx.beginPath();
  ctx.roundRect(textX, chipY, chipWidth, 16, 3);
  ctx.fillStyle = layerColor;
  ctx.fill();

  ctx.fillStyle = layer === 'Functional' ? '#000' : '#fff';
  ctx.font = '9px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(chipText, textX + 5, chipY + 8);

  // Trait count
  if (entity.trait_count !== undefined) {
    const traitText = `${entity.trait_count} traits`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '9px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(traitText, textX, chipY + 20);
  }

  // Center indicator
  if (entity.is_center) {
    ctx.fillStyle = '#00E5FF';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('CENTER', cardWidth - 8, cardHeight - 12);
  }

  return canvas;
}

// Create Three.js sprite from entity data
export function createEntitySprite(entity: EntityNodeData): THREE.Sprite {
  // Check cache first
  const cacheKey = `${entity.id}-${entity.is_center}`;
  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!.clone();
  }

  // Create initial sprite without image
  const canvas = renderCardToCanvas(entity, null, false);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(24, 15, 1); // Aspect ratio matches card (160x100)

  // Store entity data for later use
  (sprite as any).entityData = entity;

  // Load image asynchronously and update texture
  if (entity.image_url) {
    loadImage(entity.image_url).then(img => {
      if (img) {
        const updatedCanvas = renderCardToCanvas(entity, img, false);
        texture.image = updatedCanvas;
        texture.needsUpdate = true;
      }
    });
  }

  // Cache the sprite
  spriteCache.set(cacheKey, sprite);

  return sprite;
}

// Create a simpler node for non-entity types (traits, layers)
export function createSimpleNode(node: any): THREE.Mesh {
  if (node.type === 'trait') {
    const geometry = new THREE.SphereGeometry(2, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(node.color || '#666'),
      transparent: true,
      opacity: node.opacity || 0.4
    });
    return new THREE.Mesh(geometry, material);
  }

  if (node.type === 'layer') {
    const geometry = new THREE.SphereGeometry(4, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(node.color || '#888'),
      transparent: true,
      opacity: 0.6
    });
    return new THREE.Mesh(geometry, material);
  }

  // Default fallback sphere for any other node type
  const geometry = new THREE.SphereGeometry(3, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(node.color || '#444'),
    transparent: true,
    opacity: 0.5
  });
  return new THREE.Mesh(geometry, material);
}

// Clear caches (useful when switching center entity)
export function clearSpriteCache(): void {
  spriteCache.forEach(sprite => {
    if (sprite.material instanceof THREE.SpriteMaterial) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
  });
  spriteCache.clear();
}

// Export for TypeScript
export type { EntityNodeData };
