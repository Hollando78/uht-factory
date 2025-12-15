import { useFloatingCards } from '../../context/FloatingCardsContext';
import FloatingEntityCard from './FloatingEntityCard';

export default function FloatingCardContainer() {
  const { floatingCards } = useFloatingCards();

  if (floatingCards.length === 0) {
    return null;
  }

  return (
    <>
      {floatingCards.map(card => (
        <FloatingEntityCard key={card.uuid} card={card} />
      ))}
    </>
  );
}
