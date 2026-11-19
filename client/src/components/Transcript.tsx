import type { ReactNode } from 'react';
import type { ChatMessage, PublicClient } from '@bank-sim/shared';
import './Transcript.css';

interface Props {
  client: PublicClient;
  messages: ChatMessage[];
  /** The text of the toggle that shows it. */
  label: string;
  /** Anything else to show inside, after the conversation. */
  children?: ReactNode;
}

/** The interview so far, folded away until the student opens it. */
export function Transcript({ client, messages, label, children }: Props) {
  const firstName = client.name.split(' ')[0] ?? client.name;

  return (
    <details className="transcript">
      <summary>{label}</summary>
      <ol className="transcript__list">
        <li>
          <strong>{firstName}:</strong> {client.openingLine}
        </li>
        {messages.map((m, i) => (
          <li key={i}>
            <strong>{m.role === 'client' ? firstName : 'You'}:</strong> {m.content}
          </li>
        ))}
      </ol>
      {children}
    </details>
  );
}
