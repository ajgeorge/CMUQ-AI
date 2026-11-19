import type { Difficulty } from '@bank-sim/shared';
import { DIFFICULTY } from '../difficulty';
import './Difficulty.css';

export function DifficultyBadge({ level }: { level: Difficulty }) {
  return <span className={`badge difficulty difficulty--${level}`}>{DIFFICULTY[level].label}</span>;
}
