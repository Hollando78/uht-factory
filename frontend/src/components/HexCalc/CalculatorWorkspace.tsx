import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Calculate as CalculatorIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import type { SelectedEntity } from '../../types';
import type { HexOperation } from '../../utils/uhtUtils';
import HexResultCard from './HexResultCard';
import MatchesCard, { type DatabaseMatches } from './MatchesCard';
import LLMAnalysisCard, { type AnalysisResult } from './LLMAnalysisCard';
import NameResultCard from './NameResultCard';
import AcceptedNameCard from './AcceptedNameCard';
import SaveCalculationCard from './SaveCalculationCard';

export interface AcceptedName {
  name: string;
  description: string;
}

interface CalculatorWorkspaceProps {
  operands: SelectedEntity[];
  computedHex: string | null;
  operation: HexOperation;
  onOperationChange: (op: HexOperation) => void;
  loading: boolean;
  onRemoveEntity: (uuid: string) => void;
  onDropEntity: (entity: SelectedEntity) => void;
  isCompact: boolean;
  // Optional: restored data from saved calculation
  initialAcceptedName?: AcceptedName | null;
  initialAnalysis?: AnalysisResult | null;
  initialDatabaseMatches?: DatabaseMatches | null;
  // For Save/Save as functionality
  loadedCalcId?: string | null;
  loadedCalcName?: string | null;
  onCalcSaved?: () => void; // Called after save to refresh list
}

const OPERATION_INFO: Record<HexOperation, { label: string; description: string; color: string }> = {
  XOR: { label: 'XOR', description: 'Differences - traits in odd count of operands', color: '#f50057' },
  AND: { label: 'AND', description: 'Common - traits shared by ALL operands', color: '#4CAF50' },
  OR: { label: 'OR', description: 'Union - traits in ANY operand', color: '#2196F3' },
  ONE_HOT: { label: 'DIFF', description: 'Unique only - traits in EXACTLY ONE operand', color: '#FF9800' }
};

interface OperandCardProps {
  entity: SelectedEntity;
  onRemove: () => void;
  isCompact: boolean;
}

function OperandCard({ entity, onRemove, isCompact }: OperandCardProps) {
  return (
    <Card
      sx={{
        minWidth: isCompact ? 120 : 150,
        maxWidth: 180,
        position: 'relative',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        backgroundColor: 'rgba(0, 229, 255, 0.05)'
      }}
    >
      <IconButton
        size="small"
        onClick={onRemove}
        sx={{
          position: 'absolute',
          top: 2,
          right: 2,
          backgroundColor: 'rgba(0,0,0,0.5)',
          '&:hover': { backgroundColor: 'rgba(255,107,53,0.3)' },
          p: 0.5
        }}
      >
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
      {entity.image_url && (
        <Box
          component="img"
          src={entity.image_url}
          alt={entity.name}
          sx={{
            width: '100%',
            height: isCompact ? 60 : 80,
            objectFit: 'cover'
          }}
        />
      )}
      <Box sx={{ p: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: isCompact ? '0.65rem' : '0.75rem'
          }}
        >
          {entity.name}
        </Typography>
        <Typography
          variant="caption"
          color="primary"
          sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
        >
          {entity.uht_code}
        </Typography>
      </Box>
    </Card>
  );
}

interface DropZoneProps {
  onDrop: (entity: SelectedEntity) => void;
  isCompact: boolean;
}

function DropZone({ onDrop, isCompact }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const entity = JSON.parse(data) as SelectedEntity;
        onDrop(entity);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  }, [onDrop]);

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        minWidth: isCompact ? 100 : 120,
        minHeight: isCompact ? 100 : 120,
        border: isDragOver ? '2px dashed' : '2px dashed rgba(0, 229, 255, 0.3)',
        borderColor: isDragOver ? 'primary.main' : 'rgba(0, 229, 255, 0.3)',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDragOver ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
        transition: 'all 0.2s ease'
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textAlign: 'center', px: 1 }}
      >
        Drop entity here
      </Typography>
    </Box>
  );
}

export default function CalculatorWorkspace({
  operands,
  computedHex,
  operation,
  onOperationChange,
  loading,
  onRemoveEntity,
  onDropEntity,
  isCompact,
  initialAcceptedName,
  initialAnalysis,
  initialDatabaseMatches,
  loadedCalcId,
  loadedCalcName,
  onCalcSaved
}: CalculatorWorkspaceProps) {
  const opInfo = OPERATION_INFO[operation];

  // Naming state
  const [isNaming, setIsNaming] = useState(false);
  const [acceptedName, setAcceptedName] = useState<AcceptedName | null>(initialAcceptedName || null);
  const [showSaveCard, setShowSaveCard] = useState(false);

  // LLM Analysis state (lifted up for saving)
  const [llmAnalysis, setLlmAnalysis] = useState<AnalysisResult | null>(initialAnalysis || null);

  // Database matches state (lifted up for saving)
  const [databaseMatches, setDatabaseMatches] = useState<DatabaseMatches | null>(initialDatabaseMatches || null);

  // Reset state when loading a different calculation
  // This handles the case where both old and new calc have null analysis (React won't see prop change)
  useEffect(() => {
    setAcceptedName(initialAcceptedName ?? null);
    setLlmAnalysis(initialAnalysis ?? null);
    setDatabaseMatches(initialDatabaseMatches ?? null);
    setIsNaming(false);
  }, [loadedCalcId, initialAcceptedName, initialAnalysis, initialDatabaseMatches]);

  const handleAnalysisChange = useCallback((analysis: AnalysisResult | null) => {
    setLlmAnalysis(analysis);
  }, []);

  const handleMatchesChange = useCallback((matches: DatabaseMatches | null) => {
    setDatabaseMatches(matches);
  }, []);

  const handleStartNaming = useCallback(() => {
    setIsNaming(true);
  }, []);

  const handleAcceptName = useCallback((name: string, description: string) => {
    setAcceptedName({ name, description });
    setIsNaming(false);
  }, []);

  const handleCancelNaming = useCallback(() => {
    setIsNaming(false);
  }, []);

  const handleClearAcceptedName = useCallback(() => {
    setAcceptedName(null);
  }, []);

  // Empty state
  if (operands.length === 0 && !loading) {
    return (
      <Box
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
              const entity = JSON.parse(data) as SelectedEntity;
              onDropEntity(entity);
            }
          } catch (err) {}
        }}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          py: 8
        }}
      >
        <CalculatorIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Hex Calculator
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
          Drag entities from the left panel or use the search to add them.
          Combine 2+ entities using bitwise operations to discover patterns.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* TOP HEADER: Formula Section (Full Width Action Area) */}
      <Card>
        <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
          {/* Header with Operation Selector and Save Button */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {operation} Formula
              </Typography>

              <ToggleButtonGroup
                value={operation}
                exclusive
                onChange={(_, newOp) => newOp && onOperationChange(newOp)}
                size="small"
              >
                {(Object.keys(OPERATION_INFO) as HexOperation[]).map((op) => (
                  <Tooltip key={op} title={OPERATION_INFO[op].description}>
                    <ToggleButton
                      value={op}
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        '&.Mui-selected': {
                          backgroundColor: `${OPERATION_INFO[op].color}30`,
                          color: OPERATION_INFO[op].color,
                          '&:hover': {
                            backgroundColor: `${OPERATION_INFO[op].color}40`
                          }
                        }
                      }}
                    >
                      {op}
                    </ToggleButton>
                  </Tooltip>
                ))}
              </ToggleButtonGroup>
            </Box>

            {/* Save Button - Far Right */}
            {computedHex && operands.length >= 2 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                onClick={() => setShowSaveCard(!showSaveCard)}
                sx={{ fontSize: '0.75rem' }}
              >
                Save
              </Button>
            )}
          </Box>

          {/* Save Calculation Expanded */}
          {showSaveCard && computedHex && operands.length >= 2 && (
            <Box sx={{ mb: 2 }}>
              <SaveCalculationCard
                operands={operands}
                computedHex={computedHex}
                isCompact={true}
                onSaved={() => {
                  setShowSaveCard(false);
                  onCalcSaved?.();
                }}
                acceptedName={acceptedName?.name}
                acceptedDescription={acceptedName?.description}
                llmAnalysis={llmAnalysis}
                databaseMatches={databaseMatches}
                loadedCalcId={loadedCalcId}
                loadedCalcName={loadedCalcName}
              />
            </Box>
          )}

          {/* Operands Row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              mb: 2
            }}
          >
            {operands.map((entity, index) => (
              <Box key={entity.uuid} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <OperandCard
                  entity={entity}
                  onRemove={() => onRemoveEntity(entity.uuid)}
                  isCompact={isCompact}
                />
                {index < operands.length - 1 && (
                  <Chip
                    label={operation}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      backgroundColor: `${opInfo.color}30`,
                      color: opInfo.color
                    }}
                  />
                )}
              </Box>
            ))}

            {/* Drop zone for adding more */}
            <DropZone onDrop={onDropEntity} isCompact={isCompact} />
          </Box>

          {/* Compact Formula Display */}
          {operands.length >= 1 && (
            <Box
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                p: 1,
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderRadius: 1
              }}
            >
              {operands.map((entity, index) => (
                <Box key={entity.uuid} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ color: 'primary.main' }}>{entity.uht_code}</Box>
                  {index < operands.length - 1 && (
                    <Box sx={{ color: opInfo.color, fontWeight: 600, mx: 0.5 }}>{operation}</Box>
                  )}
                </Box>
              ))}
              {computedHex && (
                <>
                  <Box sx={{ color: 'text.secondary', mx: 0.5 }}>=</Box>
                  <Box sx={{ color: '#4CAF50', fontWeight: 700 }}>{computedHex}</Box>
                </>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* THREE COLUMN LAYOUT */}
      {computedHex && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : '1fr 2.5fr 1.5fr',
            gap: 2,
            minHeight: 0
          }}
        >
          {/* COLUMN 1 (20%): Context Sidebar */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Naming Flow */}
            {isNaming && (
              <NameResultCard
                hexCode={computedHex}
                sourceEntities={operands}
                operation={operation}
                onAccept={handleAcceptName}
                onCancel={handleCancelNaming}
              />
            )}

            {/* Accepted Name Card */}
            {acceptedName && !isNaming && (
              <AcceptedNameCard
                name={acceptedName.name}
                description={acceptedName.description}
                hexCode={computedHex}
                onClear={handleClearAcceptedName}
              />
            )}

            {/* Database Matches */}
            <MatchesCard
              hexCode={computedHex}
              onNameResult={!isNaming && !acceptedName ? handleStartNaming : undefined}
              initialMatches={databaseMatches}
              onMatchesChange={handleMatchesChange}
            />
          </Box>

          {/* COLUMN 2 (50%): Result Analysis - Core Data */}
          <HexResultCard hexCode={computedHex} operands={operands} operation={operation} isCompact={isCompact} />

          {/* COLUMN 3 (30%): LLM Analysis - Insight */}
          {operands.length >= 2 && (
            <LLMAnalysisCard
              operands={operands}
              computedHex={computedHex}
              isCompact={isCompact}
              initialAnalysis={llmAnalysis}
              onAnalysisChange={handleAnalysisChange}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
