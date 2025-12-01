import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Chip,
  LinearProgress,
  Tooltip,
  Alert,
  Collapse
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';

export default function Header() {
  const { state, actions } = useApp();

  const isLoading = Object.values(state.loading).some(loading => loading);
  const loadingText = getLoadingText(state.loading);

  const handleRefresh = () => {
    // Implement refresh logic based on current view
    window.location.reload();
  };

  return (
    <>
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <Toolbar sx={{ minHeight: '64px !important' }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {getViewTitle(state.currentView)}
            {state.selectedEntity && (
              <Typography 
                component="span" 
                variant="body2" 
                sx={{ 
                  ml: 2, 
                  color: 'text.secondary',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                }}
              >
                {state.selectedEntity.name} • {state.selectedEntity.uht_code}
              </Typography>
            )}
          </Typography>

          {/* Status Chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
            {/* Graph Status */}
            {state.graphData.nodes.length > 0 && (
              <Chip
                icon={<CheckIcon />}
                label={`${state.graphData.nodes.length} entities`}
                size="small"
                color="success"
                variant="outlined"
              />
            )}

            {/* Loading Status */}
            {isLoading && (
              <Chip
                label={loadingText}
                size="small"
                color="primary"
                sx={{ animation: 'pulse 1.5s ease-in-out infinite' }}
              />
            )}

            {/* Current View Chip */}
            <Chip
              label={state.currentView}
              size="small"
              color="primary"
              sx={{ textTransform: 'capitalize', fontWeight: 600 }}
            />
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title="Refresh">
              <IconButton 
                color="inherit" 
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Settings">
              <IconButton color="inherit">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>

        {/* Loading Progress Bar */}
        {isLoading && (
          <LinearProgress 
            color="primary"
            sx={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#00E5FF',
              }
            }}
          />
        )}
      </AppBar>

      {/* Error Alert */}
      <Collapse in={!!state.error}>
        <Alert
          severity="error"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={actions.clearError}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{ 
            borderRadius: 0,
            borderBottom: '1px solid rgba(0, 229, 255, 0.3)'
          }}
        >
          {state.error}
        </Alert>
      </Collapse>
    </>
  );
}

function getViewTitle(view: string): string {
  const titles = {
    classification: 'Entity Classification',
    graph: '3D Knowledge Graph',
    comparison: 'UHT vs Embeddings Analysis',
    gallery: 'Entity Gallery'
  };
  return titles[view as keyof typeof titles] || 'UHT Factory';
}

function getLoadingText(loading: Record<string, boolean>): string {
  if (loading.classification) return 'Classifying...';
  if (loading.preprocess) return 'Pre-processing...';
  if (loading.graph) return 'Loading graph...';
  if (loading.image) return 'Generating image...';
  if (loading.embedding) return 'Computing embeddings...';
  return 'Processing...';
}