/**
 * Advanced Visualization Components
 *
 * This module provides an interactive 2D scatter plot visualization for
 * exploring entity embeddings projected via UMAP, t-SNE, or PaCMAP.
 *
 * Main components:
 * - AdvancedVizView: Container with projection type selector
 * - FilterableScatterPlot: Core visualization with filters, tours, and clustering
 *
 * Utilities:
 * - scatterPlotUtils: Helper functions for colors, distances, and geometry
 * - types: TypeScript interfaces and type definitions
 */

export { default as AdvancedVizView } from './AdvancedVizView';
export { default as FilterableScatterPlot } from './FilterableScatterPlot';

// Export utilities
export * from './utils/scatterPlotUtils';
export * from './types';
