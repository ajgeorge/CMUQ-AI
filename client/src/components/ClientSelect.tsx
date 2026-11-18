import type { Difficulty, PublicClient } from '@bank-sim/shared';
import './ClientSelect.css';

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  beginner: 'Open and talkative',
  intermediate: 'Answers what you ask',
  advanced: 'Guarded; needs specific questions',
};

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
              <span className={`badge client-card__level client-card__level--${client.difficulty}`}>
                {capitalise(client.difficulty)}
              </span>{' '}
              <span className="client-card__hint">{DIFFICULTY_HINT[client.difficulty]}</span>
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

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
