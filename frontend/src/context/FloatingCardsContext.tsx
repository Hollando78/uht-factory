import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'uht_floating_cards';
const MAX_CARDS = 5;
const CASCADE_OFFSET = 30;
const INITIAL_X = 100;
const INITIAL_Y = 100;
const BASE_Z_INDEX = 1000;

export interface FloatingCard {
  uuid: string;
  position: { x: number; y: number };
  zIndex: number;
}

interface FloatingCardsContextType {
  floatingCards: FloatingCard[];
  addFloatingCard: (uuid: string) => void;
  removeFloatingCard: (uuid: string) => void;
  updateCardPosition: (uuid: string, position: { x: number; y: number }) => void;
  bringToFront: (uuid: string) => void;
  isFloating: (uuid: string) => boolean;
}

const FloatingCardsContext = createContext<FloatingCardsContextType | null>(null);

export function useFloatingCards() {
  const context = useContext(FloatingCardsContext);
  if (!context) {
    throw new Error('useFloatingCards must be used within a FloatingCardsProvider');
  }
  return context;
}

interface FloatingCardsProviderProps {
  children: ReactNode;
}

export function FloatingCardsProvider({ children }: FloatingCardsProviderProps) {
  const [floatingCards, setFloatingCards] = useState<FloatingCard[]>(() => {
    // Load from localStorage on mount
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate and sanitize stored data
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (card): card is FloatingCard =>
              typeof card.uuid === 'string' &&
              typeof card.position?.x === 'number' &&
              typeof card.position?.y === 'number' &&
              typeof card.zIndex === 'number'
          );
        }
      }
    } catch (e) {
      console.error('Failed to load floating cards from localStorage:', e);
    }
    return [];
  });

  // Persist to localStorage when cards change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(floatingCards));
    } catch (e) {
      console.error('Failed to save floating cards to localStorage:', e);
    }
  }, [floatingCards]);

  const addFloatingCard = useCallback((uuid: string) => {
    setFloatingCards(prev => {
      // Don't add if already exists
      if (prev.some(c => c.uuid === uuid)) {
        // Bring existing card to front instead
        const highestZ = Math.max(...prev.map(c => c.zIndex));
        return prev.map(c =>
          c.uuid === uuid ? { ...c, zIndex: highestZ + 1 } : c
        );
      }

      // Remove oldest if at max capacity
      let cards = prev;
      if (cards.length >= MAX_CARDS) {
        // Remove the card with lowest zIndex (oldest/furthest back)
        const lowestZ = Math.min(...cards.map(c => c.zIndex));
        cards = cards.filter(c => c.zIndex !== lowestZ);
      }

      // Calculate position (cascade from last card or start position)
      const lastCard = cards[cards.length - 1];
      const position = lastCard
        ? {
            x: Math.min(lastCard.position.x + CASCADE_OFFSET, window.innerWidth - 350),
            y: Math.min(lastCard.position.y + CASCADE_OFFSET, window.innerHeight - 400)
          }
        : { x: INITIAL_X, y: INITIAL_Y };

      const highestZ = cards.length > 0 ? Math.max(...cards.map(c => c.zIndex)) : BASE_Z_INDEX;

      return [...cards, { uuid, position, zIndex: highestZ + 1 }];
    });
  }, []);

  const removeFloatingCard = useCallback((uuid: string) => {
    setFloatingCards(prev => prev.filter(c => c.uuid !== uuid));
  }, []);

  const updateCardPosition = useCallback((uuid: string, position: { x: number; y: number }) => {
    setFloatingCards(prev =>
      prev.map(c => (c.uuid === uuid ? { ...c, position } : c))
    );
  }, []);

  const bringToFront = useCallback((uuid: string) => {
    setFloatingCards(prev => {
      const highestZ = Math.max(...prev.map(c => c.zIndex));
      const targetCard = prev.find(c => c.uuid === uuid);

      // Only update if not already at front
      if (targetCard && targetCard.zIndex < highestZ) {
        return prev.map(c =>
          c.uuid === uuid ? { ...c, zIndex: highestZ + 1 } : c
        );
      }
      return prev;
    });
  }, []);

  const isFloating = useCallback((uuid: string) => {
    return floatingCards.some(c => c.uuid === uuid);
  }, [floatingCards]);

  return (
    <FloatingCardsContext.Provider
      value={{
        floatingCards,
        addFloatingCard,
        removeFloatingCard,
        updateCardPosition,
        bringToFront,
        isFloating
      }}
    >
      {children}
    </FloatingCardsContext.Provider>
  );
}
