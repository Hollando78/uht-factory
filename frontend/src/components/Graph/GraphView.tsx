import React, { useEffect, useRef, useState } from 'react';
import { 
  Box, Card, CardContent, Typography, Button, Paper, Tooltip, 
  Drawer, List, ListItem, ListItemText, ListItemIcon, Switch, 
  FormControlLabel, Divider, Chip, Slider, ButtonGroup,
  IconButton, Collapse, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import ForceGraph3D from 'react-force-graph-3d';
import {
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  AccountTree as TreeIcon,
  ScatterPlot as ScatterIcon,
  GridOn as GridIcon,
  RadioButtonUnchecked as CircleIcon,
  Stop as SquareIcon,
  ChangeHistory as TriangleIcon,
  Tune as TuneIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';
import API from '../../services/api';

const API_BASE_URL = 'http://localhost:8100';

// Custom tooltip component for image preview
const ImageTooltip: React.FC<{
  node: any;
  position: { x: number; y: number };
  visible: boolean;
}> = ({ node, position, visible }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && node && node.type === 'entity') {
      setLoading(true);
      // Check if entity has an image (only for entity nodes)
      fetch(`${API_BASE_URL}/api/v1/images/entity/${node.id}`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('No image found');
        })
        .then(data => {
          setImageUrl(data.image_url);
        })
        .catch(() => {
          setImageUrl(null);
        })
        .finally(() => {
          setLoading(false);
        });
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
        
        {/* Show different content based on node type */}
        {node.type === 'layer' && (
          <>
            <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 1 }}>
              Layer Node
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Contains 8 traits that define {node.layer.toLowerCase()} characteristics
            </Typography>
          </>
        )}
        
        {node.type === 'trait' && (
          <>
            <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace', display: 'block', mb: 1 }}>
              Bit {node.bit} • {node.layer} Layer
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
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
              <Box sx={{ textAlign: 'center', p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Loading image...
                </Typography>
              </Box>
            ) : imageUrl ? (
              <Box sx={{ mt: 1 }}>
                <img
                  src={`${API_BASE_URL}${imageUrl}`}
                  alt={node.name}
                  style={{
                    width: '100%',
                    maxWidth: '200px',
                    height: 'auto',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No image available
              </Typography>
            )}
            
            <Typography variant="caption" sx={{ color: node.color, mt: 1, display: 'block' }}>
              {node.layer_dominance} Layer • {node.trait_count} traits
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default function GraphView() {
  const { state, actions } = useApp();
  const fgRef = useRef();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [filteredData, setFilteredData] = useState({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Control panel state
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [showTraits, setShowTraits] = useState(true);
  const [showEntities, setShowEntities] = useState(true);
  const [layerFilter, setLayerFilter] = useState('all');
  const [layout, setLayout] = useState('force');
  const [entityShape, setEntityShape] = useState('cube');
  const [linkDistance, setLinkDistance] = useState(50);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async () => {
    try {
      actions.setLoading({ graph: true });
      
      // Get full trait-centric graph data from Neo4j
      const graphResponse = await API.graph.getFullGraph(50, 0.7);
      
      const nodes = graphResponse.nodes.map((node: any) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        uht_code: node.uht_code,
        color: node.color,
        val: node.val,
        opacity: node.opacity,
        shape: node.shape,
        layer: node.layer,
        bit: node.bit,
        description: node.description,
        layer_dominance: node.layer_dominance,
        trait_count: node.trait_count
      }));

      const links = graphResponse.links.map((link: any) => ({
        source: link.source,
        target: link.target,
        type: link.type,
        distance: link.distance
      }));

      setGraphData({ nodes, links });
      setFilteredData({ nodes, links }); // Initialize filtered data
      actions.setGraphData({ nodes, links });
      
      console.log(`Loaded trait-centric graph:`, graphResponse.stats);
      console.log(`Sample nodes:`, nodes.slice(0, 5));
      console.log(`Sample links:`, links.slice(0, 5));
      
    } catch (error) {
      console.error('Failed to load graph data:', error);
      actions.setError('Failed to load graph data from Neo4j');
    } finally {
      actions.setLoading({ graph: false });
    }
  };

  // Filter graph data based on controls
  useEffect(() => {
    if (!graphData.nodes.length) return;
    
    let filteredNodes = graphData.nodes.filter(node => {
      // Type visibility filters
      if (node.type === 'layer' && !showLayers) return false;
      if (node.type === 'trait' && !showTraits) return false;
      if (node.type === 'entity' && !showEntities) return false;
      
      // Layer filter
      if (layerFilter !== 'all' && node.layer && node.layer !== layerFilter) return false;
      
      return true;
    });
    
    // Get node IDs to filter links
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = graphData.links.filter(link => 
      nodeIds.has(link.source) && nodeIds.has(link.target)
    );
    
    setFilteredData({ nodes: filteredNodes, links: filteredLinks });
  }, [graphData, showLayers, showTraits, showEntities, layerFilter]);

  const getNodeColor = (entity: any) => {
    // Color by dominant layer
    if (!entity.layers) return '#FFFFFF';
    
    const layerCounts = {
      Physical: parseInt(entity.layers.Physical, 16).toString(2).split('1').length - 1,
      Functional: parseInt(entity.layers.Functional, 16).toString(2).split('1').length - 1,
      Abstract: parseInt(entity.layers.Abstract, 16).toString(2).split('1').length - 1,
      Social: parseInt(entity.layers.Social, 16).toString(2).split('1').length - 1
    };
    
    const dominant = Object.entries(layerCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    const colors = {
      Physical: '#FF6B35',
      Functional: '#00E5FF',
      Abstract: '#9C27B0',
      Social: '#4CAF50'
    };
    
    return colors[dominant as keyof typeof colors] || '#FFFFFF';
  };

  const calculateUHTSimilarity = (code1: string, code2: string) => {
    if (!code1 || !code2) return 0;
    
    const bin1 = parseInt(code1, 16).toString(2).padStart(32, '0');
    const bin2 = parseInt(code2, 16).toString(2).padStart(32, '0');
    
    let matches = 0;
    for (let i = 0; i < 32; i++) {
      if (bin1[i] === bin2[i]) matches++;
    }
    
    return matches / 32;
  };

  // Custom node geometries for visual distinction
  const getNodeGeometry = (node: any) => {
    if (node.type === 'layer') return 'sphere';
    if (node.type === 'trait') return 'box';
    // Entities get custom shapes based on selection
    return entityShape;
  };

  // Auto-layout functions
  const applyLayout = () => {
    const fg = fgRef.current;
    if (!fg) return;

    switch (layout) {
      case 'hierarchical':
        // Position layers at center, traits in rings, entities on outside
        filteredData.nodes.forEach((node, i) => {
          if (node.type === 'layer') {
            const angle = (node.layer === 'Physical' ? 0 : 
                          node.layer === 'Functional' ? Math.PI/2 : 
                          node.layer === 'Abstract' ? Math.PI : 
                          3*Math.PI/2);
            node.fx = Math.cos(angle) * 100;
            node.fy = Math.sin(angle) * 100;
            node.fz = 0;
          } else if (node.type === 'trait') {
            const layerAngle = node.layer === 'Physical' ? 0 : 
                              node.layer === 'Functional' ? Math.PI/2 : 
                              node.layer === 'Abstract' ? Math.PI : 
                              3*Math.PI/2;
            const traitAngle = layerAngle + (node.bit % 8) * Math.PI / 4;
            node.fx = Math.cos(traitAngle) * 200;
            node.fy = Math.sin(traitAngle) * 200;
            node.fz = 0;
          }
        });
        break;
      case 'layered':
        // Stack layers vertically
        filteredData.nodes.forEach(node => {
          if (node.type === 'layer') {
            node.fz = node.layer === 'Physical' ? -150 : 
                     node.layer === 'Functional' ? -50 : 
                     node.layer === 'Abstract' ? 50 : 150;
            node.fx = 0;
            node.fy = 0;
          }
        });
        break;
      default:
        // Remove fixed positions for force layout
        filteredData.nodes.forEach(node => {
          delete node.fx;
          delete node.fy;
          delete node.fz;
        });
    }
    
    fg.refresh();
  };

  useEffect(() => {
    if (filteredData.nodes.length > 0) {
      setTimeout(applyLayout, 100);
    }
  }, [layout, filteredData]);

  const handleNodeClick = (node: any) => {
    // Only handle clicks on entity nodes
    if (node.type === 'entity') {
      API.entities.getEntity(node.id).then(entity => {
        actions.setSelectedEntity(entity);
      }).catch(error => {
        console.error('Failed to load entity:', error);
      });
    }
    // For layer and trait nodes, we just show the tooltip on hover
  };

  const handleNodeHover = (node: any) => {
    setHoveredNode(node);
  };

  const handleMouseMove = (event: MouseEvent) => {
    setMousePosition({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      {/* Controls Button */}
      <IconButton
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 1000,
          bgcolor: 'rgba(26, 26, 26, 0.9)',
          '&:hover': { bgcolor: 'rgba(26, 26, 26, 1)' }
        }}
        onClick={() => setControlsOpen(!controlsOpen)}
      >
        <SettingsIcon sx={{ color: 'white' }} />
      </IconButton>

      {/* Graph Container */}
      <Box sx={{ height: '100%', width: '100%' }}>
        {filteredData.nodes.length > 0 ? (
          <>
            <Typography variant="body2" sx={{ position: 'absolute', top: 60, left: 20, color: 'white', zIndex: 1000 }}>
              Rendering {filteredData.nodes.length} nodes, {filteredData.links.length} links
            </Typography>
            <ForceGraph3D
            ref={fgRef}
            graphData={filteredData}
            nodeLabel="name"
            nodeColor="color"
            nodeVal="val"
            nodeOpacity={1.0}
            nodeResolution={12}
            nodeRelSize={6}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            linkOpacity={0.7}
            linkWidth={(link: any) => link.type === 'trait_to_layer' ? 2 : 1}
            linkColor={(link: any) => link.type === 'trait_to_layer' ? '#888' : '#666'}
            linkDistance={linkDistance}
            backgroundColor="rgba(30, 30, 40, 1)"
            showNavInfo={false}
            controlType="orbit"
            enableNodeDrag={false}
            d3AlphaDecay={0.01}
            d3VelocityDecay={0.3}
            width={window.innerWidth - 240} // Subtract sidebar width
            height={window.innerHeight - 64} // Subtract header height
          />
          </>
        ) : (
          <Box 
            sx={{ 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            <Card>
              <CardContent sx={{ textAlign: 'center', p: 4 }}>
                <Typography variant="h6" gutterBottom>
                  3D Knowledge Graph
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {state.loading.graph ? 'Loading graph data...' : 'No entities to display'}
                </Typography>
                {!state.loading.graph && (
                  <Button variant="outlined" onClick={loadGraphData}>
                    Reload Graph
                  </Button>
                )}
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      {/* Entity Details Panel */}
      {state.selectedEntity && (
        <Paper 
          sx={{ 
            position: 'absolute',
            top: 16,
            right: 16,
            width: 300,
            p: 2,
            bgcolor: 'rgba(26, 26, 26, 0.95)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <Typography variant="h6" gutterBottom>
            {state.selectedEntity.name}
          </Typography>
          <Typography 
            variant="h5" 
            color="primary" 
            sx={{ fontFamily: 'monospace', mb: 1 }}
          >
            {state.selectedEntity.uht_code}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {state.selectedEntity.description}
          </Typography>
        </Paper>
      )}

      {/* Controls Drawer */}
      <Drawer
        anchor="left"
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: 320,
            bgcolor: 'rgba(26, 26, 26, 0.95)',
            backdropFilter: 'blur(10px)',
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
          
          {/* Node Visibility */}
          <Typography variant="subtitle2" gutterBottom>
            Node Visibility
          </Typography>
          <List dense>
            <ListItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={showLayers}
                    onChange={(e) => setShowLayers(e.target.checked)}
                    color="primary"
                  />
                }
                label={`Layer Nodes (${graphData.nodes.filter(n => n.type === 'layer').length})`}
              />
            </ListItem>
            <ListItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={showTraits}
                    onChange={(e) => setShowTraits(e.target.checked)}
                    color="primary"
                  />
                }
                label={`Trait Nodes (${graphData.nodes.filter(n => n.type === 'trait').length})`}
              />
            </ListItem>
            <ListItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={showEntities}
                    onChange={(e) => setShowEntities(e.target.checked)}
                    color="primary"
                  />
                }
                label={`Entity Nodes (${graphData.nodes.filter(n => n.type === 'entity').length})`}
              />
            </ListItem>
          </List>
          
          <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />
          
          {/* Layer Filter */}
          <Typography variant="subtitle2" gutterBottom>
            Layer Filter
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <Select
              value={layerFilter}
              onChange={(e) => setLayerFilter(e.target.value)}
              sx={{ color: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }}
            >
              <MenuItem value="all">All Layers</MenuItem>
              <MenuItem value="Physical">Physical</MenuItem>
              <MenuItem value="Functional">Functional</MenuItem>
              <MenuItem value="Abstract">Abstract</MenuItem>
              <MenuItem value="Social">Social</MenuItem>
            </Select>
          </FormControl>
          
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
              Circular
            </Button>
            <Button 
              onClick={() => setLayout('layered')}
              variant={layout === 'layered' ? 'contained' : 'outlined'}
              startIcon={<GridIcon />}
            >
              Layered
            </Button>
          </ButtonGroup>
          
          {/* Entity Shape */}
          <Typography variant="subtitle2" gutterBottom>
            Entity Shape
          </Typography>
          <ButtonGroup fullWidth variant="outlined" sx={{ mb: 2 }}>
            <Button 
              onClick={() => setEntityShape('cube')}
              variant={entityShape === 'cube' ? 'contained' : 'outlined'}
              startIcon={<SquareIcon />}
            >
              Cube
            </Button>
            <Button 
              onClick={() => setEntityShape('diamond')}
              variant={entityShape === 'diamond' ? 'contained' : 'outlined'}
              startIcon={<TriangleIcon />}
            >
              Diamond
            </Button>
            <Button 
              onClick={() => setEntityShape('sphere')}
              variant={entityShape === 'sphere' ? 'contained' : 'outlined'}
              startIcon={<CircleIcon />}
            >
              Sphere
            </Button>
          </ButtonGroup>
          
          {/* Link Distance */}
          <Typography variant="subtitle2" gutterBottom>
            Link Distance: {linkDistance}
          </Typography>
          <Slider
            value={linkDistance}
            onChange={(e, value) => setLinkDistance(value as number)}
            min={20}
            max={100}
            step={5}
            sx={{ mb: 2, color: 'primary.main' }}
          />
          
          {/* Stats */}
          <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography variant="caption" display="block">
              Visible: {filteredData.nodes.length} nodes, {filteredData.links.length} links
            </Typography>
            <Typography variant="caption" display="block">
              Total: {graphData.nodes.length} nodes, {graphData.links.length} links
            </Typography>
          </Paper>
        </Box>
      </Drawer>

      {/* Image Tooltip */}
      <ImageTooltip
        node={hoveredNode}
        position={mousePosition}
        visible={!!hoveredNode}
      />
    </Box>
  );
}