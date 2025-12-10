import { useState } from 'react';
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
  Collapse,
  Button,
  CircularProgress
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
  CheckCircle as CheckIcon,
  Menu as MenuIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';
import { useMobile } from '../../context/MobileContext';
import { useAuth } from '../../context/AuthContext';
import SettingsDialog from './SettingsDialog';
import AuthModal from '../Auth/AuthModal';

export default function Header() {
  const { state, actions } = useApp();
  const { isMobile, isTablet, toggleDrawer } = useMobile();
  const { state: authState, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const showHamburger = isMobile || isTablet;
  const isLoading = Object.values(state.loading).some(loading => loading);
  const loadingText = getLoadingText(state.loading);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleLogout = async () => {
    await logout();
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
        <Toolbar sx={{ minHeight: { xs: '56px', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
          {/* Hamburger Menu for Mobile */}
          {showHamburger && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={toggleDrawer}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Title */}
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              fontSize: { xs: '0.95rem', sm: '1.25rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            UHT Factory
            {/* Hide entity info on mobile to save space */}
            {!isMobile && state.selectedEntity && (
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

          {/* Status Chips - hide some on mobile */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.5, sm: 1 },
            mr: { xs: 0.5, sm: 2 }
          }}>
            {/* Graph Status - hide on mobile */}
            {!isMobile && state.graphData.nodes.length > 0 && (
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
                label={isMobile ? '...' : loadingText}
                size="small"
                color="primary"
                sx={{ animation: 'pulse 1.5s ease-in-out infinite' }}
              />
            )}

            {/* Current View Chip - smaller on mobile */}
            {!isMobile && (
              <Chip
                label={state.currentView}
                size="small"
                color="primary"
                sx={{ textTransform: 'capitalize', fontWeight: 600 }}
              />
            )}
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Auth Button */}
            {authState.isLoading ? (
              <CircularProgress size={24} sx={{ mx: 1 }} />
            ) : authState.isAuthenticated ? (
              <>
                {!isMobile && (
                  <Chip
                    icon={<PersonIcon />}
                    label={authState.user?.email?.split('@')[0] || 'User'}
                    size="small"
                    variant="outlined"
                    sx={{ mr: 1 }}
                  />
                )}
                <Tooltip title="Logout">
                  <IconButton color="inherit" onClick={handleLogout}>
                    <LogoutIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Button
                color="inherit"
                startIcon={!isMobile && <LoginIcon />}
                onClick={() => setAuthModalOpen(true)}
                size="small"
                sx={{ mr: 1 }}
              >
                {isMobile ? <LoginIcon /> : 'Login'}
              </Button>
            )}

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
              <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>

        {/* Settings Dialog */}
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Auth Modal */}
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

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

function getLoadingText(loading: Record<string, boolean>): string {
  if (loading.classification) return 'Classifying...';
  if (loading.preprocess) return 'Pre-processing...';
  if (loading.graph) return 'Loading graph...';
  if (loading.image) return 'Generating image...';
  if (loading.embedding) return 'Computing embeddings...';
  return 'Processing...';
}
