import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Drawer,
  Fab,
  useMediaQuery,
  useTheme,
  Snackbar
} from '@mui/material';
import {
  Calculate as CalculatorIcon,
  Share as ShareIcon,
  Clear as ClearIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import { entityAPI } from '../../services/api';
import EntitySourcePanel, { type LoadCalculationData } from './EntitySourcePanel';
import CalculatorWorkspace, { type AcceptedName } from './CalculatorWorkspace';
import SEO from '../common/SEO';
import type { SelectedEntity } from '../../types';
import { applyHexOperation, type HexOperation } from '../../utils/uhtUtils';
import type { AnalysisResult } from './LLMAnalysisCard';
import type { DatabaseMatches } from './MatchesCard';

export default function HexCalcView() {
  const theme = useTheme();
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));

  const [searchParams, setSearchParams] = useSearchParams();
  const [operands, setOperands] = useState<SelectedEntity[]>([]);
  const [operation, setOperation] = useState<HexOperation>('XOR');
  const [loading, setLoading] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Restored data from saved calculation
  const [loadedCalcId, setLoadedCalcId] = useState<string | null>(null);
  const [loadedCalcName, setLoadedCalcName] = useState<string | null>(null);
  const [restoredAcceptedName, setRestoredAcceptedName] = useState<AcceptedName | null>(null);
  const [restoredAnalysis, setRestoredAnalysis] = useState<AnalysisResult | null>(null);
  const [restoredDatabaseMatches, setRestoredDatabaseMatches] = useState<DatabaseMatches | null>(null);
  const [calcRefreshTrigger, setCalcRefreshTrigger] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Computed result based on selected operation
  const computedHex = useMemo(() => {
    if (operands.length < 2) return null;
    return applyHexOperation(operands.map(e => e.uht_code), operation);
  }, [operands, operation]);

  // Load entities from URL on mount
  useEffect(() => {
    const entitiesParam = searchParams.get('entities');
    if (entitiesParam) {
      const uuids = entitiesParam.split(',').filter(Boolean);
      if (uuids.length > 0) {
        loadEntitiesFromUuids(uuids);
      }
    }
  }, []);

  // Update URL when operands change
  useEffect(() => {
    if (operands.length > 0) {
      const uuids = operands.map(e => e.uuid).join(',');
      setSearchParams({ entities: uuids }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [operands, setSearchParams]);

  const loadEntitiesFromUuids = async (uuids: string[]) => {
    setLoading(true);
    try {
      const entities = await Promise.all(
        uuids.map(uuid => entityAPI.getEntity(uuid))
      );
      const selected: SelectedEntity[] = entities.map(e => ({
        uuid: e.uuid,
        name: e.name,
        uht_code: e.uht_code,
        image_url: e.image_url
      }));
      setOperands(selected);
    } catch (err) {
      console.error('Failed to load entities from URL:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntity = useCallback((entity: SelectedEntity) => {
    // Don't add duplicates
    if (operands.some(e => e.uuid === entity.uuid)) return;
    setOperands(prev => [...prev, entity]);
    if (isNarrow) setMobileDrawerOpen(false);
  }, [operands, isNarrow]);

  const handleRemoveEntity = useCallback((uuid: string) => {
    setOperands(prev => prev.filter(e => e.uuid !== uuid));
  }, []);

  const handleClearAll = useCallback(() => {
    setOperands([]);
    // Clear loaded calc info when starting fresh
    setLoadedCalcId(null);
    setLoadedCalcName(null);
    setRestoredAcceptedName(null);
    setRestoredAnalysis(null);
    setRestoredDatabaseMatches(null);
  }, []);

  const handleShare = useCallback(() => {
    const uuids = operands.map(e => e.uuid).join(',');
    const url = `${window.location.origin}/hex-calc?entities=${uuids}`;
    navigator.clipboard.writeText(url);
    setSnackbarOpen(true);
  }, [operands]);

  const handleCalcSaved = useCallback(() => {
    // Trigger refresh of saved calculations list
    setCalcRefreshTrigger(prev => prev + 1);
  }, []);

  const handleLoadCalculation = useCallback((data: LoadCalculationData) => {
    // Load the entities
    loadEntitiesFromUuids(data.uuids);

    // Track loaded calculation for "Save" (overwrite) functionality
    setLoadedCalcId(data.id);
    setLoadedCalcName(data.name);

    // Restore accepted name if available
    if (data.acceptedName) {
      setRestoredAcceptedName({
        name: data.acceptedName,
        description: data.acceptedDescription || ''
      });
    } else {
      setRestoredAcceptedName(null);
    }

    // Restore LLM analysis if available
    if (data.llmAnalysis) {
      try {
        const parsedAnalysis = JSON.parse(data.llmAnalysis) as AnalysisResult;
        setRestoredAnalysis(parsedAnalysis);
      } catch (err) {
        console.error('Failed to parse saved LLM analysis:', err);
        setRestoredAnalysis(null);
      }
    } else {
      setRestoredAnalysis(null);
    }

    // Restore database matches if available
    if (data.databaseMatches) {
      try {
        const parsedMatches = JSON.parse(data.databaseMatches) as DatabaseMatches;
        setRestoredDatabaseMatches(parsedMatches);
      } catch (err) {
        console.error('Failed to parse saved database matches:', err);
        setRestoredDatabaseMatches(null);
      }
    } else {
      setRestoredDatabaseMatches(null);
    }
  }, []);

  return (
    <>
      <SEO
        title="Hex Calculator"
        description="Perform bitwise XOR operations on UHT entity codes. Combine entities to discover new classifications."
        url="https://factory.universalhex.org/hex-calc"
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
            <CalculatorIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
            <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
              Hex Calculator
            </Typography>
            <Chip
              label={`${operands.length} operand${operands.length !== 1 ? 's' : ''}`}
              size="small"
              color="primary"
              variant="outlined"
            />

            {operands.length > 0 && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Tooltip title="Share calculation">
                  <IconButton
                    size="small"
                    onClick={handleShare}
                    disabled={operands.length < 2}
                  >
                    <ShareIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Clear all">
                  <IconButton size="small" onClick={handleClearAll}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Main Content */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            overflow: 'hidden',
            flexDirection: isNarrow ? 'column' : 'row'
          }}
        >
          {/* Entity Source Panel - Desktop */}
          {!isNarrow && (
            <Box
              sx={{
                width: '35%',
                minWidth: 280,
                maxWidth: 400,
                borderRight: '1px solid rgba(0, 229, 255, 0.2)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <EntitySourcePanel
                onSelectEntity={handleAddEntity}
                selectedUuids={operands.map(e => e.uuid)}
                onLoadCalculation={handleLoadCalculation}
                refreshTrigger={calcRefreshTrigger}
                loadedCalcId={loadedCalcId}
              />
            </Box>
          )}

          {/* Calculator Workspace */}
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: isCompact ? 1.5 : 2 }}>
            <CalculatorWorkspace
              operands={operands}
              computedHex={computedHex}
              operation={operation}
              onOperationChange={setOperation}
              loading={loading}
              onRemoveEntity={handleRemoveEntity}
              onDropEntity={handleAddEntity}
              isCompact={isCompact}
              initialAcceptedName={restoredAcceptedName}
              initialAnalysis={restoredAnalysis}
              initialDatabaseMatches={restoredDatabaseMatches}
              loadedCalcId={loadedCalcId}
              loadedCalcName={loadedCalcName}
              onCalcSaved={handleCalcSaved}
            />
          </Box>
        </Box>

        {/* Mobile FAB */}
        {isNarrow && (
          <Fab
            color="primary"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1000
            }}
            onClick={() => setMobileDrawerOpen(true)}
          >
            <AddIcon />
          </Fab>
        )}

        {/* Mobile Drawer */}
        <Drawer
          anchor="bottom"
          open={mobileDrawerOpen && isNarrow}
          onClose={() => setMobileDrawerOpen(false)}
          sx={{
            '& .MuiDrawer-paper': {
              height: '70vh',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
            }
          }}
        >
          <EntitySourcePanel
            onSelectEntity={handleAddEntity}
            selectedUuids={operands.map(e => e.uuid)}
            onLoadCalculation={handleLoadCalculation}
            refreshTrigger={calcRefreshTrigger}
            loadedCalcId={loadedCalcId}
          />
        </Drawer>

        {/* Snackbar for copy confirmation */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={2000}
          onClose={() => setSnackbarOpen(false)}
          message="Link copied to clipboard"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </Box>
    </>
  );
}
