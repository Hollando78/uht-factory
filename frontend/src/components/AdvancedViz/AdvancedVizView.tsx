import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  AutoGraph as VizIcon
} from '@mui/icons-material';
import { useMobile } from '../../context/MobileContext';
import { explorerAPI, type ProjectionStats } from '../../services/api';
import FilterableScatterPlot from './FilterableScatterPlot';
import SEO from '../common/SEO';

type ProjectionType = 'umap' | 'tsne' | 'uht_umap';

export default function AdvancedVizView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [projectionType, setProjectionType] = useState<ProjectionType>('umap');
  const [stats, setStats] = useState<ProjectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleProjectionTypeChange = (
    _: React.MouseEvent<HTMLElement>,
    newType: ProjectionType | null
  ) => {
    if (newType) {
      setProjectionType(newType);
    }
  };

  const handleEntitySelect = (uuid: string) => {
    // For now, open entity in new tab or show details
    window.open(`/entity/${uuid}`, '_blank');
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
        title="Advanced Visualizations"
        description="Interactive visualization tools with filtering, animation, and LLM-guided exploration of the UHT entity space."
        url="https://factory.universalhex.org/advanced-viz"
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
            <VizIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
            <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
              Advanced Visualizations
            </Typography>

            {stats && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={`${stats.with_embedding.toLocaleString()} entities`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>
            )}

            <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
              <ToggleButtonGroup
                value={projectionType}
                exclusive
                onChange={handleProjectionTypeChange}
                size="small"
              >
                <ToggleButton value="umap">UMAP</ToggleButton>
                <ToggleButton value="tsne">t-SNE</ToggleButton>
                <ToggleButton value="uht_umap">UHT-PaCMAP</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
        </Paper>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
          <FilterableScatterPlot
            projectionType={projectionType}
            onEntitySelect={handleEntitySelect}
          />
        </Box>
      </Box>
    </>
  );
}
