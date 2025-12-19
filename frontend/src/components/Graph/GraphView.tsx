import { useEffect, useRef, useState, useCallback } from 'react';
import type { FC } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Paper,
  Drawer, List, ListItem, Switch,
  FormControlLabel, Divider, Slider, ButtonGroup,
  IconButton, Chip, Alert, CircularProgress
} from '@mui/material';
import ForceGraph3D from 'react-force-graph-3d';
import {
  Settings as SettingsIcon,
  AccountTree as TreeIcon,
  ScatterPlot as ScatterIcon,
  GridOn as GridIcon,
  Tune as TuneIcon,
  ZoomOutMap as ExpandIcon,
  CenterFocusStrong as CenterIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';
import API from '../../services/api';
import GraphSearchBar from './GraphSearchBar';
import type { SimilarityMetric } from './GraphSearchBar';
import { createEntitySprite, createSimpleNode, clearSpriteCache } from './EntityCardSprite';

const API_BASE_URL = '';

// Custom tooltip component for image preview
const ImageTooltip: FC<{
  node: any;
  position: { x: number; y: number };
  visible: boolean;
}> = ({ node, position, visible }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && node && node.type === 'entity') {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/v1/images/entity/${node.id}`)
        .then(response => {
          if (response.ok) return response.json();
          throw new Error('No image found');
        })
        .then(data => setImageUrl(data.image_url))
        .catch(() => setImageUrl(null))
        .finally(() => setLoading(false));
    } else {
      setImageUrl(null);
      setLoading(false);
    }
  }, [visible, node]);

  if (!visible || !node) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        left: position.x + 20,
        top: position.y + 20,
        zIndex: 10000,
        pointerEvents: 'none',
        maxWidth: 300
      }}
    >
      <Paper
        sx={{
          p: 2,
          bgcolor: 'rgba(26, 26, 26, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'white'
        }}
      >
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          {node.name}
        </Typography>

        {node.type === 'layer' && (
          <>
            <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 1 }}>
              Layer Node
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contains 8 traits that define {node.layer?.toLowerCase()} characteristics
            </Typography>
          </>
        )}

        {node.type === 'trait' && (
          <>
            <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace', display: 'block', mb: 1 }}>
              Bit {node.bit} - {node.layer} Layer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {node.description}
            </Typography>
          </>
        )}

        {node.type === 'entity' && (
          <>
            <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace', display: 'block', mb: 1 }}>
              {node.uht_code}
            </Typography>

            {loading ? (
              <Typography variant="caption" color="text.secondary">Loading image...</Typography>
            ) : imageUrl ? (
              <Box sx={{ mt: 1 }}>
                <img
                  src={imageUrl.startsWith('http') ? imageUrl : `${API_BASE_URL}${imageUrl}`}
                  alt={node.name}
                  style={{
                    width: '100%',
                    maxWidth: '200px',
                    height: 'auto',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </Box>
            ) : null}

            <Typography variant="caption" sx={{ color: node.color, mt: 1, display: 'block' }}>
              {node.layer_dominance} Layer - {node.trait_count} traits
            </Typography>
            {node.is_center && (
              <Chip label="Center" size="small" color="primary" sx={{ mt: 1 }} />
            )}
          </>
        )}
      </Paper>
    </Box>
  );
};

interface GraphNode {
  id: string;
  name: string;
  type: string;
  uht_code?: string;
  color: string;
  val: number;
  opacity?: number;
  layer?: string;
  bit?: number;
  description?: string;
  layer_dominance?: string;
  trait_count?: number;
  is_center?: boolean;
  image_url?: string;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  distance?: number;
  metric?: string;
  similarity?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function GraphView() {
  const { actions } = useApp();
  const [searchParams] = useSearchParams();
  const fgRef = useRef<any>(null);

  // Graph state
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Search-centered mode state
  const [centerEntityUuid, setCenterEntityUuid] = useState<string | null>(null);
  const [centerEntityName, setCenterEntityName] = useState<string>('');
  const [similarityMetric, setSimilarityMetric] = useState<SimilarityMetric>('embedding');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Control panel state
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showTraitContext, setShowTraitContext] = useState(true);
  const [layout, setLayout] = useState('force');
  const [linkDistance, setLinkDistance] = useState(50);

  // Handle URL parameter for initial entity
  useEffect(() => {
    const centerUuid = searchParams.get('center');
    if (centerUuid && !centerEntityUuid) {
      loadNeighborhood(centerUuid, 'URL parameter');
    }
  }, [searchParams]);

  // Load neighborhood for an entity
  const loadNeighborhood = useCallback(async (uuid: string, name: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await API.graph.getNeighborhood(uuid, similarityMetric, 15, showTraitContext);

      // Build combined graph data
      const entityNodes: GraphNode[] = [
        {
          id: response.center.id,
          name: response.center.name,
          type: 'entity',
          uht_code: response.center.uht_code,
          color: response.center.color,
          val: response.center.val,
          layer_dominance: response.center.layer_dominance,
          trait_count: response.center.trait_count,
          is_center: true,
          image_url: response.center.image_url
        },
        ...response.nodes.map((n: any) => ({
          id: n.id,
          name: n.name,
          type: 'entity',
          uht_code: n.uht_code,
          color: n.color,
          val: n.val,
          layer_dominance: n.layer_dominance,
          trait_count: n.trait_count,
          is_center: false,
          image_url: n.image_url
        }))
      ];

      // Similarity links between entities
      const entityLinks: GraphLink[] = response.links.map((l: any) => ({
        source: l.source,
        target: l.target,
        type: l.type,
        metric: l.metric,
        similarity: l.similarity,
        distance: l.distance
      }));

      // Add trait context if requested
      let allNodes = [...entityNodes];
      let allLinks = [...entityLinks];

      if (showTraitContext && response.trait_nodes) {
        allNodes = [
          ...allNodes,
          ...response.trait_nodes.map((n: any) => ({
            ...n,
            opacity: n.opacity || 0.4
          }))
        ];
        allLinks = [
          ...allLinks,
          ...response.trait_links
        ];
      }

      setGraphData({ nodes: allNodes, links: allLinks });
      setCenterEntityUuid(uuid);
      setCenterEntityName(name || response.center.name);
      setExpandedNodes(new Set([uuid]));

      // Center camera on the graph
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(500, 100);
        }
      }, 500);

    } catch (err) {
      console.error('Failed to load neighborhood:', err);
      setError('Failed to load entity neighborhood');
    } finally {
      setLoading(false);
    }
  }, [similarityMetric, showTraitContext]);

  // Expand from a node
  const handleExpand = useCallback(async (node: GraphNode) => {
    if (expandedNodes.has(node.id)) return;

    setLoading(true);
    try {
      const existingUuids = graphData.nodes
        .filter(n => n.type === 'entity')
        .map(n => n.id);

      const response = await API.graph.expandNode(
        node.id,
        similarityMetric,
        10,
        existingUuids
      );

      if (response.new_nodes.length === 0) {
        // No new neighbors found
        setExpandedNodes(prev => new Set([...prev, node.id]));
        return;
      }

      // Position new nodes in a sphere around the source node
      const sourceX = (node as any).x || 0;
      const sourceY = (node as any).y || 0;
      const sourceZ = (node as any).z || 0;
      const spreadRadius = 40;

      // Merge new nodes with initial positions near source
      setGraphData(prev => ({
        nodes: [
          ...prev.nodes,
          ...response.new_nodes.map((n: any, i: number) => {
            // Distribute in a sphere around source node
            const phi = Math.acos(-1 + (2 * i) / response.new_nodes.length);
            const theta = Math.sqrt(response.new_nodes.length * Math.PI) * phi;
            return {
              id: n.id,
              name: n.name,
              type: 'entity',
              uht_code: n.uht_code,
              color: n.color,
              val: n.val,
              layer_dominance: n.layer_dominance,
              trait_count: n.trait_count,
              is_center: false,
              image_url: n.image_url,
              // Initial position near source (force sim will adjust)
              x: sourceX + spreadRadius * Math.cos(theta) * Math.sin(phi),
              y: sourceY + spreadRadius * Math.sin(theta) * Math.sin(phi),
              z: sourceZ + spreadRadius * Math.cos(phi)
            };
          })
        ],
        links: [
          ...prev.links,
          ...response.new_links
        ]
      }));

      setExpandedNodes(prev => new Set([...prev, node.id]));

      // Smooth camera adjustment - pull back to show new nodes while keeping focus
      setTimeout(() => {
        if (fgRef.current) {
          const nodePos = { x: (node as any).x || 0, y: (node as any).y || 0, z: (node as any).z || 0 };
          const currentPos = fgRef.current.cameraPosition();

          // Calculate direction from node to camera
          const dx = currentPos.x - nodePos.x;
          const dy = currentPos.y - nodePos.y;
          const dz = currentPos.z - nodePos.z;
          const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

          // Pull back to distance that shows neighbors (spreadRadius + margin)
          const targetDist = Math.max(currentDist, 90);

          const newCamPos = {
            x: nodePos.x + (dx / currentDist) * targetDist,
            y: nodePos.y + (dy / currentDist) * targetDist,
            z: nodePos.z + (dz / currentDist) * targetDist
          };

          fgRef.current.cameraPosition(
            newCamPos,
            nodePos, // keep looking at the expanded node
            1000     // smooth animation
          );
        }
      }, 100);

    } catch (err) {
      console.error('Failed to expand:', err);
    } finally {
      setLoading(false);
    }
  }, [graphData, expandedNodes, similarityMetric]);

  // Handle entity selection from search
  const handleEntitySelect = useCallback((uuid: string, name: string) => {
    loadNeighborhood(uuid, name);
  }, [loadNeighborhood]);

  // Handle metric change - reload if we have a center entity
  const handleMetricChange = useCallback((newMetric: SimilarityMetric) => {
    setSimilarityMetric(newMetric);
    if (centerEntityUuid) {
      loadNeighborhood(centerEntityUuid, centerEntityName);
    }
  }, [centerEntityUuid, centerEntityName, loadNeighborhood]);

  // Clear graph and reset
  const handleClear = useCallback(() => {
    clearSpriteCache(); // Clear sprite cache when resetting
    setGraphData({ nodes: [], links: [] });
    setCenterEntityUuid(null);
    setCenterEntityName('');
    setExpandedNodes(new Set());
    setSelectedNode(null);
    setFocusedNodeId(null);
  }, []);

  // Custom node rendering - use cards for entities, spheres for traits
  const renderNodeThreeObject = useCallback((node: any) => {
    if (node.type === 'entity') {
      return createEntitySprite({
        id: node.id,
        name: node.name,
        uht_code: node.uht_code,
        image_url: node.image_url,
        layer_dominance: node.layer_dominance,
        trait_count: node.trait_count,
        is_center: node.is_center,
        is_focused: node.id === focusedNodeId
      });
    }
    return createSimpleNode(node);
  }, [focusedNodeId]);

  // Double-click detection
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // Node click handler with double-click detection
  const handleNodeClick = useCallback((node: any) => {
    if (node.type !== 'entity') return;

    const now = Date.now();
    const lastClick = lastClickRef.current;

    // Check for double-click
    if (lastClick && lastClick.nodeId === node.id && (now - lastClick.time) < DOUBLE_CLICK_THRESHOLD) {
      // Double-click: focus camera and expand
      lastClickRef.current = null;

      // Set this node as focused (for highlighting)
      setFocusedNodeId(node.id);

      // Expand neighbors if not already expanded
      // Camera adjustment happens in handleExpand after nodes are added
      if (!expandedNodes.has(node.id)) {
        handleExpand(node);
      } else {
        // Already expanded - just smoothly center on node
        if (fgRef.current) {
          const nodePos = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
          fgRef.current.cameraPosition(
            undefined, // keep current position
            nodePos,   // look at node
            600
          );
        }
      }
    } else {
      // Single click: select node
      lastClickRef.current = { nodeId: node.id, time: now };
      setSelectedNode(node);
      // Load full entity details
      API.entities.getEntity(node.id).then(entity => {
        actions.setSelectedEntity(entity);
      }).catch(console.error);
    }
  }, [actions, expandedNodes, handleExpand]);

  // Mouse tracking for tooltip
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Get link color based on metric
  const getLinkColor = useCallback((link: any) => {
    if (link.type === 'entity_to_entity') {
      const opacity = Math.max(0.3, (link.similarity || 0.5) * 0.8);
      if (similarityMetric === 'embedding') return `rgba(0, 229, 255, ${opacity})`;
      if (similarityMetric === 'hamming') return `rgba(255, 107, 53, ${opacity})`;
      return `rgba(156, 39, 176, ${opacity})`;
    }
    if (link.type === 'trait_to_layer') return 'rgba(136, 136, 136, 0.3)';
    return 'rgba(102, 102, 102, 0.2)';
  }, [similarityMetric]);

  const entityCount = graphData.nodes.filter(n => n.type === 'entity').length;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search Bar */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <GraphSearchBar
          onEntitySelect={handleEntitySelect}
          metric={similarityMetric}
          onMetricChange={handleMetricChange}
          disabled={loading}
        />
      </Box>

      {/* Main Graph Area */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Status Bar */}
        {centerEntityUuid && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              right: 8,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap'
            }}
          >
            <Chip
              icon={<CenterIcon />}
              label={centerEntityName}
              color="primary"
              onDelete={handleClear}
              deleteIcon={<ClearIcon />}
            />
            <Typography variant="caption" color="text.secondary">
              {entityCount} entities - {graphData.links.filter(l => l.type === 'entity_to_entity').length} connections
            </Typography>
            {loading && <CircularProgress size={16} />}
          </Box>
        )}

        {/* Controls Button */}
        <IconButton
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 1000,
            bgcolor: 'rgba(26, 26, 26, 0.9)',
            '&:hover': { bgcolor: 'rgba(26, 26, 26, 1)' }
          }}
          onClick={() => setControlsOpen(true)}
        >
          <SettingsIcon sx={{ color: 'white' }} />
        </IconButton>

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ position: 'absolute', top: 50, left: 8, right: 8, zIndex: 1000 }}>
            {error}
          </Alert>
        )}

        {/* Graph Container */}
        {graphData.nodes.length > 0 ? (
          <ForceGraph3D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={(node: any) => node.type === 'entity' ? `${node.name}\n${node.uht_code}` : node.name}
            nodeThreeObject={renderNodeThreeObject}
            nodeThreeObjectExtend={false}
            onNodeClick={handleNodeClick}
            onNodeHover={setHoveredNode}
            linkOpacity={0.8}
            linkWidth={(link: any) => link.type === 'entity_to_entity' ? 2 : 1}
            linkColor={getLinkColor}
            backgroundColor="rgba(20, 20, 30, 1)"
            showNavInfo={false}
            controlType="orbit"
            enableNodeDrag={false}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.4}
          />
        ) : (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Card sx={{ maxWidth: 400, textAlign: 'center' }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom color="primary">
                  Entity Explorer
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Search for an entity above to explore its neighborhood.
                  Discover similar entities through semantic meaning or structural traits.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Try: Lion, Computer, Democracy, or Gravity
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Selected Entity Panel */}
        {selectedNode && (
          <Paper
            sx={{
              position: 'absolute',
              top: 50,
              right: 16,
              width: 280,
              p: 2,
              bgcolor: 'rgba(26, 26, 26, 0.95)',
              backdropFilter: 'blur(10px)',
              maxHeight: 'calc(100% - 100px)',
              overflow: 'auto'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {selectedNode.name}
              </Typography>
              <IconButton size="small" onClick={() => setSelectedNode(null)}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </Box>

            <Typography
              variant="body2"
              color="primary"
              sx={{ fontFamily: 'monospace', mb: 1 }}
            >
              {selectedNode.uht_code}
            </Typography>

            {selectedNode.image_url && (
              <Box sx={{ mb: 2 }}>
                <img
                  src={selectedNode.image_url.startsWith('http') ? selectedNode.image_url : `${API_BASE_URL}${selectedNode.image_url}`}
                  alt={selectedNode.name}
                  style={{ width: '100%', borderRadius: 4 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </Box>
            )}

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {selectedNode.layer_dominance} Layer - {selectedNode.trait_count} traits
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
              {!expandedNodes.has(selectedNode.id) && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ExpandIcon />}
                  onClick={() => handleExpand(selectedNode)}
                  disabled={loading}
                  fullWidth
                >
                  Expand
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                onClick={() => window.open(`/entity/${selectedNode.id}`, '_blank')}
                fullWidth
              >
                Details
              </Button>
            </Box>
          </Paper>
        )}
      </Box>

      {/* Controls Drawer */}
      <Drawer
        anchor="left"
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: 300,
            bgcolor: 'rgba(26, 26, 26, 0.98)',
            color: 'white',
            borderRight: '1px solid rgba(255,255,255,0.1)'
          }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <TuneIcon sx={{ mr: 1 }} />
            Graph Controls
          </Typography>

          <Divider sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />

          {/* Display Options */}
          <Typography variant="subtitle2" gutterBottom>
            Display
          </Typography>
          <List dense>
            <ListItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={showTraitContext}
                    onChange={(e) => setShowTraitContext(e.target.checked)}
                    color="primary"
                  />
                }
                label="Show Trait Context"
              />
            </ListItem>
          </List>

          <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />

          {/* Layout Options */}
          <Typography variant="subtitle2" gutterBottom>
            Layout
          </Typography>
          <ButtonGroup fullWidth variant="outlined" sx={{ mb: 2 }}>
            <Button
              onClick={() => setLayout('force')}
              variant={layout === 'force' ? 'contained' : 'outlined'}
              startIcon={<ScatterIcon />}
            >
              Force
            </Button>
            <Button
              onClick={() => setLayout('hierarchical')}
              variant={layout === 'hierarchical' ? 'contained' : 'outlined'}
              startIcon={<TreeIcon />}
            >
              Ring
            </Button>
            <Button
              onClick={() => setLayout('layered')}
              variant={layout === 'layered' ? 'contained' : 'outlined'}
              startIcon={<GridIcon />}
            >
              Stack
            </Button>
          </ButtonGroup>

          {/* Link Distance */}
          <Typography variant="subtitle2" gutterBottom>
            Link Distance: {linkDistance}
          </Typography>
          <Slider
            value={linkDistance}
            onChange={(_, value) => setLinkDistance(value as number)}
            min={20}
            max={100}
            step={5}
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />

          {/* Stats */}
          <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)' }}>
            <Typography variant="caption" display="block">
              Entities: {entityCount}
            </Typography>
            <Typography variant="caption" display="block">
              Trait nodes: {graphData.nodes.filter(n => n.type === 'trait').length}
            </Typography>
            <Typography variant="caption" display="block">
              Connections: {graphData.links.length}
            </Typography>
            <Typography variant="caption" display="block">
              Expanded: {expandedNodes.size}
            </Typography>
          </Paper>

          {centerEntityUuid && (
            <Button
              variant="outlined"
              color="error"
              fullWidth
              onClick={handleClear}
              sx={{ mt: 2 }}
            >
              Clear Graph
            </Button>
          )}
        </Box>
      </Drawer>

      {/* Image Tooltip */}
      <ImageTooltip
        node={hoveredNode}
        position={mousePosition}
        visible={!!hoveredNode && hoveredNode.type === 'entity'}
      />
    </Box>
  );
}
