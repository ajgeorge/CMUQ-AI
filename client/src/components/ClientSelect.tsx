import type { PublicClient } from '@bank-sim/shared';
import { DIFFICULTY } from '../difficulty';
import { DifficultyBadge } from './Difficulty';
import './ClientSelect.css';

interface Props {
  clients: PublicClient[];
  onStart: (client: PublicClient) => void;
}

export function ClientSelect({ clients, onStart }: Props) {
  return (
    <ul className="client-list">
      {clients.map((client) => (
        <li key={client.id}>
          <article className="card client-card" aria-labelledby={`client-${client.id}`}>
            <h2 id={`client-${client.id}`} className="client-card__name">
              {client.name}
            </h2>
            <p className="client-card__meta">
              {client.age} · {client.occupation}
              <br />
              {client.location}
            </p>
            <p className="client-card__difficulty">
              <DifficultyBadge level={client.difficulty} />{' '}
              <span className="client-card__hint">{DIFFICULTY[client.difficulty].hint}</span>
            </p>
            <p className="client-card__summary">{client.summary}</p>
            <button type="button" className="button" onClick={() => onStart(client)}>
              Interview {client.name.split(' ')[0]}
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}
