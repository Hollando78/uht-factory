/**
 * Type definitions for the scatter plot visualization.
 */

import type { ProjectionPoint, ClusterLabel, TourResponse, SelectionDescription, SubsetProjectionResponse } from '../../services/api';
import type { Trait } from '../../types';

export type ColorMode = 'layer' | 'trait_count' | 'none';
export type LassoMode = 'off' | 'drawing' | 'active';
export type TourAnimPhase = 'idle' | 'highlight' | 'zoom_in' | 'neighbors' | 'linger' | 'zoom_out' | 'fly';
export type ProjectionType = 'umap' | 'tsne' | 'uht' | 'uht_umap';

export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface LayerFilter {
  Physical: boolean;
  Functional: boolean;
  Abstract: boolean;
  Social: boolean;
}

export interface TraitWalkState {
  enabled: boolean;
  currentIndex: number;
  highlightedTrait: number | null;
}

export interface TooltipPosition {
  x: number;
  y: number;
}

export interface FilterPanelProps {
  // Layer filter
  layerFilter: LayerFilter;
  onLayerFilterChange: (layer: keyof LayerFilter) => void;

  // Trait range filter
  traitRange: [number, number];
  onTraitRangeChange: (range: [number, number]) => void;

  // Lasso
  lassoMode: LassoMode;
  lassoInvert: boolean;
  lassoPointsCount: number;
  onLassoStart: () => void;
  onLassoClear: () => void;
  onLassoInvertChange: (invert: boolean) => void;

  // Subset projection
  hasActiveFilters: boolean;
  filteredPointsCount: number;
  totalPointsCount: number;
  subsetProjection: SubsetProjectionResponse | null;
  subsetLoading: boolean;
  onComputeSubset: () => void;
  onResetSubset: () => void;

  // Visibility
  showFilters: boolean;
  onToggleFilters: () => void;
}

export interface ControlsPanelProps {
  // Color mode
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;

  // Point size
  pointSize: number;
  onPointSizeChange: (size: number) => void;

  // Labels
  showLabels: boolean;
  onShowLabelsChange: (show: boolean) => void;

  // Heatmap
  heatmapEnabled: boolean;
  heatmapReference: ProjectionPoint | null;
  onHeatmapToggle: () => void;
  onHeatmapClear: () => void;

  // Trait walk
  traitWalk: TraitWalkState;
  onTraitWalkToggle: () => void;
  onTraitWalkPrev: () => void;
  onTraitWalkNext: () => void;

  // Export
  onExportHighRes: () => void;
  onExportGif: (forMobile: boolean) => void;
  gifExporting: boolean;
  gifProgress: number;
}

export interface TourPanelProps {
  tour: TourResponse | null;
  tourIndex: number;
  tourPlaying: boolean;
  tourLoading: boolean;
  tourAnimPhase: TourAnimPhase;
  onStartTour: (type: 'random_walk' | 'theme' | 'contrast' | 'complexity' | 'layer_journey', theme?: string) => void;
  onPlayTour: () => void;
  onPauseTour: () => void;
  onStopTour: () => void;
  onGoToStop: (index: number) => void;
}

export interface InsightPanelProps {
  selectionDescription: SelectionDescription | null;
  insightLoading: boolean;
  hasFilteredPoints: boolean;
  onDescribeSelection: () => void;
  onClearInsight: () => void;
}

// Re-export API types
export type { ProjectionPoint, ClusterLabel, TourResponse, SelectionDescription, SubsetProjectionResponse, Trait };
