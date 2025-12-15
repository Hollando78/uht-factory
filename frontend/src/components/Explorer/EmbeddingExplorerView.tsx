import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  ScatterPlot as ScatterIcon,
  Timeline as CorrelationIcon,
  CompareArrows as NeighborIcon,
  Warning as OutlierIcon
} from '@mui/icons-material';
import { useMobile } from '../../context/MobileContext';
import { explorerAPI, type ProjectionStats } from '../../services/api';
import ProjectionScatterPlot from './ProjectionScatterPlot';
import CorrelationPlot from './CorrelationPlot';
import NeighborComparisonPanel from './NeighborComparisonPanel';
import OutliersPanel from './OutliersPanel';
import SEO from '../common/SEO';

type TabValue = 'projection' | 'correlation' | 'neighbors' | 'outliers';
type ProjectionType = 'umap' | 'tsne';

export default function EmbeddingExplorerView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [activeTab, setActiveTab] = useState<TabValue>('projection');
  const [projectionType, setProjectionType] = useState<ProjectionType>('umap');
  const [stats, setStats] = useState<ProjectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityUuid, setSelectedEntityUuid] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await explorerAPI.getProjectionStats();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load projection stats:', err);
      setError('Failed to load projection statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: TabValue) => {
    setActiveTab(newValue);
  };

  const handleProjectionTypeChange = (
    _: React.MouseEvent<HTMLElement>,
    newType: ProjectionType | null
  ) => {
    if (newType) {
      setProjectionType(newType);
    }
  };

  const handleEntitySelect = (uuid: string) => {
    setSelectedEntityUuid(uuid);
    setActiveTab('neighbors');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <>
      <SEO
        title="Embedding Explorer"
        description="Explore the relationship between semantic embeddings and UHT structural codes. Visualize entity projections in 2D space."
        url="https://factory.universalhex.org/explorer"
      />

      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Paper
          sx={{
            p: isCompact ? 1.5 : 2,
            borderRadius: 0,
            borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
            flexShrink: 0
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <ScatterIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
            <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
              Embedding Explorer
            </Typography>

            {stats && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={`${stats.with_embedding.toLocaleString()} entities`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${stats.with_umap.toLocaleString()} UMAP`}
                  size="small"
                  variant="outlined"
                  sx={{ color: 'text.secondary', borderColor: 'rgba(255,255,255,0.3)' }}
                />
                <Chip
                  label={`${stats.with_tsne.toLocaleString()} t-SNE`}
                  size="small"
                  variant="outlined"
                  sx={{ color: 'text.secondary', borderColor: 'rgba(255,255,255,0.3)' }}
                />
              </Box>
            )}

            {activeTab === 'projection' && (
              <Box sx={{ ml: 'auto' }}>
                <ToggleButtonGroup
                  value={projectionType}
                  exclusive
                  onChange={handleProjectionTypeChange}
                  size="small"
                >
                  <ToggleButton value="umap">UMAP</ToggleButton>
                  <ToggleButton value="tsne">t-SNE</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
          </Box>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            sx={{ mt: 1 }}
            variant={isCompact ? 'scrollable' : 'standard'}
            scrollButtons="auto"
          >
            <Tab
              value="projection"
              label="2D Projection"
              icon={<ScatterIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              value="correlation"
              label="Correlation"
              icon={<CorrelationIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              value="neighbors"
              label="Neighbors"
              icon={<NeighborIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              value="outliers"
              label="Outliers"
              icon={<OutlierIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
          </Tabs>
        </Paper>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
          {activeTab === 'projection' && (
            <ProjectionScatterPlot
              projectionType={projectionType}
              onEntitySelect={handleEntitySelect}
            />
          )}
          {activeTab === 'correlation' && (
            <CorrelationPlot />
          )}
          {activeTab === 'neighbors' && (
            <NeighborComparisonPanel
              selectedEntityUuid={selectedEntityUuid}
              onEntitySelect={setSelectedEntityUuid}
            />
          )}
          {activeTab === 'outliers' && (
            <OutliersPanel onEntitySelect={handleEntitySelect} />
          )}
        </Box>
      </Box>
    </>
  );
}
