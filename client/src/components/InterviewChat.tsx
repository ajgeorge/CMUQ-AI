import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CHAT_LIMITS, type ChatMessage, type PublicClient } from '@bank-sim/shared';
import { api, errorMessage } from '../api';
import { canEndInterview, limitReached, maxNextQuestionLength, questionsAsked } from '../state';
import './InterviewChat.css';

/** Show a "start wrapping up" warning when this many questions are left. */
const WARN_WHEN_LEFT = 5;

interface Props {
  client: PublicClient;
  messages: ChatMessage[];
  onExchange: (question: string, reply: string) => void;
  onEnd: () => void;
  onLeave: () => void;
}

export function InterviewChat({ client, messages, onExchange, onEnd, onLeave }: Props) {
  const [text, setText] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endOfMessagesRef = useRef<HTMLLIElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const ids = { input: useId(), counts: useId(), endHint: useId() };

  const firstName = client.name.split(' ')[0] ?? client.name;
  const asked = questionsAsked(messages);
  const questionsLeft = CHAT_LIMITS.maxStudentTurns - asked;
  const maxLength = maxNextQuestionLength(messages);
  const finished = limitReached(messages);
  const sending = pendingQuestion !== null;
  const canEnd = canEndInterview(messages) && !sending;

  // The question being sent is shown in the same list, at the position it will keep once
  // answered, so screen readers announce it once (the log role reads out new items).
  const shown: ChatMessage[] =
    pendingQuestion === null
      ? messages
      : [...messages, { role: 'student', content: pendingQuestion }];

  // Cancel an in-flight request if the student leaves the interview.
  useEffect(() => () => requestRef.current?.abort(), []);

  // Keep the newest message in view, just above the question box (which stays fixed at the
  // bottom of the screen, and whose height depends on screen size and any warnings shown).
  useEffect(() => {
    const end = endOfMessagesRef.current;
    if (!end) return;
    const composerHeight = composerRef.current?.offsetHeight ?? 0;
    end.style.scrollMarginBottom = `${composerHeight + 16}px`;
    end.scrollIntoView({ block: 'end' });
  }, [messages.length, pendingQuestion]);

  async function send() {
    const question = text.trim();
    if (!question || sending || finished) return;

    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    setPendingQuestion(question);
    setText('');

    try {
      const { reply } = await api.chat(
        { clientId: client.id, messages: [...messages, { role: 'student', content: question }] },
        controller.signal,
      );
      onExchange(question, reply);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorMessage(err));
      setText(question); // nothing the student typed is lost
    } finally {
      if (!controller.signal.aborted) {
        setPendingQuestion(null);
        inputRef.current?.focus();
      }
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  // Enter sends; Shift+Enter adds a new line (and Enter while composing text is ignored).
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  function handleLeave() {
    const hasProgress = messages.length > 0 || text.trim() !== '';
    if (!hasProgress || window.confirm('Leave this interview? The conversation will be lost.')) {
      onLeave();
    }
  }

  return (
    <section className="chat" aria-label={`Interview with ${client.name}`}>
      <div className="chat__toolbar">
        <button type="button" className="chat__leave" onClick={handleLeave}>
          Choose a different client
        </button>
      </div>
      <div role="log" aria-label={`Conversation with ${firstName}`} className="chat__log">
        <ol className="chat__messages">
          <Message author={firstName} from="client" content={client.openingLine} />
          {shown.map((message, i) => (
            <Message
              key={i}
              author={message.role === 'client' ? firstName : 'You'}
              from={message.role}
              content={message.content}
            />
          ))}
          <li ref={endOfMessagesRef} className="chat__end" aria-hidden="true" />
        </ol>
      </div>

      <p role="status" className="chat__typing">
        {sending ? `${firstName} is typing…` : ''}
      </p>

      <form
        ref={composerRef}
        className="chat__composer"
        onSubmit={handleSubmit}
        aria-busy={sending}
      >
        {error && (
          <p role="alert" className="alert alert--error">
            {error}
          </p>
        )}
        {finished ? (
          <p className="alert alert--warning">
            You have reached the end of the interview. End it to write your summary.
          </p>
        ) : (
          questionsLeft <= WARN_WHEN_LEFT && (
            <p className="alert alert--warning">
              {questionsLeft === 1 ? '1 question' : `${questionsLeft} questions`} left. Start
              wrapping up and confirm what you have learned.
            </p>
          )
        )}

        <label htmlFor={ids.input} className="field__label">
          Your question to {firstName}
        </label>
        <textarea
          id={ids.input}
          ref={inputRef}
          rows={3}
          value={text}
          maxLength={maxLength}
          readOnly={sending}
          disabled={finished}
          aria-describedby={ids.counts}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <p id={ids.counts} className="field__hint chat__counts">
          <span>
            {text.length}/{maxLength} characters
          </span>{' '}
          <span>
            {asked} of {CHAT_LIMITS.maxStudentTurns} questions asked
          </span>{' '}
          <span className="chat__keys">Enter to send, Shift+Enter for a new line</span>
        </p>

        <div className="button-row chat__actions">
          <button type="submit" className="button" disabled={sending || finished || !text.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={!canEnd}
            aria-describedby={canEndInterview(messages) ? undefined : ids.endHint}
            onClick={onEnd}
          >
            End interview
          </button>
        </div>
        {!canEndInterview(messages) && (
          <p id={ids.endHint} className="field__hint">
            Ask at least {CHAT_LIMITS.minStudentTurns} questions before ending the interview.
          </p>
        )}
      </form>
    </section>
  );
}

function Message({
  author,
  from,
  content,
}: {
  author: string;
  from: ChatMessage['role'];
  content: string;
}) {
  return (
    <li className={`chat__message chat__message--${from}`}>
      <span className="chat__author">{author}</span>
      <p className="chat__text">{content}</p>
    </li>
  );
}
