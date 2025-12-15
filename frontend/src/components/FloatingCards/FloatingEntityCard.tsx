import { useState, useEffect, useRef, useCallback } from 'react';
import { Paper, Box, Typography, IconButton, CircularProgress } from '@mui/material';
import { Close as CloseIcon, DragIndicator as DragIcon } from '@mui/icons-material';
import { entityAPI } from '../../services/api';
import { useFloatingCards, type FloatingCard } from '../../context/FloatingCardsContext';
import type { UHTEntity } from '../../types';
import CompactEntityView from './CompactEntityView';

const CARD_WIDTH = 300;
const HEADER_HEIGHT = 36;

interface FloatingEntityCardProps {
  card: FloatingCard;
}

export default function FloatingEntityCard({ card }: FloatingEntityCardProps) {
  const { removeFloatingCard, updateCardPosition, bringToFront } = useFloatingCards();
  const [entity, setEntity] = useState<UHTEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch entity data
  useEffect(() => {
    let cancelled = false;

    async function fetchEntity() {
      setLoading(true);
      try {
        const data = await entityAPI.getEntity(card.uuid);
        if (!cancelled) {
          setEntity(data);
        }
      } catch (err) {
        console.error('Failed to fetch entity for floating card:', err);
        if (!cancelled) {
          setEntity(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEntity();

    return () => {
      cancelled = true;
    };
  }, [card.uuid]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      e.preventDefault();
      bringToFront(card.uuid);
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: card.position.x,
        posY: card.position.y
      };
    }
  }, [card.uuid, card.position, bringToFront]);

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Calculate new position with viewport bounds
      const newX = Math.max(0, Math.min(
        window.innerWidth - CARD_WIDTH,
        dragStartRef.current.posX + deltaX
      ));
      const newY = Math.max(0, Math.min(
        window.innerHeight - 100, // Allow some room at bottom
        dragStartRef.current.posY + deltaY
      ));

      updateCardPosition(card.uuid, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, card.uuid, updateCardPosition]);

  // Bring to front on click
  const handleCardClick = useCallback(() => {
    bringToFront(card.uuid);
  }, [card.uuid, bringToFront]);

  return (
    <Paper
      ref={cardRef}
      elevation={8}
      onClick={handleCardClick}
      sx={{
        position: 'fixed',
        left: card.position.x,
        top: card.position.y,
        width: CARD_WIDTH,
        zIndex: card.zIndex,
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: 'none',
        boxShadow: isDragging
          ? '0 12px 40px rgba(0, 229, 255, 0.3)'
          : '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}
    >
      {/* Header */}
      <Box
        className="drag-handle"
        onMouseDown={handleMouseDown}
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: HEADER_HEIGHT,
          px: 1,
          bgcolor: 'rgba(0, 229, 255, 0.1)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.2)',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <DragIcon
          sx={{
            fontSize: 18,
            color: 'text.secondary',
            mr: 0.5
          }}
        />
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {loading ? 'Loading...' : (entity?.name || 'Unknown Entity')}
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            removeFloatingCard(card.uuid);
          }}
          sx={{
            p: 0.5,
            '&:hover': { bgcolor: 'rgba(255, 100, 100, 0.2)' }
          }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ minHeight: 150 }}>
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 150
            }}
          >
            <CircularProgress size={24} />
          </Box>
        ) : (
          <CompactEntityView entity={entity} loading={false} />
        )}
      </Box>
    </Paper>
  );
}
