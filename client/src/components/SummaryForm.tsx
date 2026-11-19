import { useId, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  InterviewSummarySchema,
  SUMMARY_LIMITS,
  type ChatMessage,
  type InterviewSummary,
  type Product,
  type PublicClient,
} from '@bank-sim/shared';
import { groupByCategory } from '../product-groups';
import type { SummaryDraft } from '../state';
import { Transcript } from './Transcript';
import './SummaryForm.css';

type Field = keyof SummaryDraft;
type Errors = Partial<Record<Field, string>>;

interface Props {
  client: PublicClient;
  products: Product[];
  messages: ChatMessage[];
  draft: SummaryDraft;
  canGoBack: boolean;
  onChange: (changes: Partial<SummaryDraft>) => void;
  onBack: () => void;
  onSubmit: (summary: InterviewSummary) => void;
}

export function SummaryForm(props: Props) {
  const { client, products, messages, draft, canGoBack, onChange, onBack, onSubmit } = props;
  const [errors, setErrors] = useState<Errors>({});
  const needsRef = useRef<HTMLTextAreaElement>(null);
  const productsRef = useRef<HTMLFieldSetElement>(null);
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const firstName = client.name.split(' ')[0] ?? client.name;

  function change(changes: Partial<SummaryDraft>) {
    onChange(changes);
    // Clear the error for whatever the student just fixed.
    setErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(changes) as Field[]) delete next[field];
      return next;
    });
  }

  function toggleProduct(id: string, checked: boolean) {
    const ids = draft.recommendedProductIds;
    change({ recommendedProductIds: checked ? [...ids, id] : ids.filter((p) => p !== id) });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = InterviewSummarySchema.safeParse(draft);
    if (result.success) {
      onSubmit(result.data);
      return;
    }

    const found: Errors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as Field;
      found[field] ??= issue.message;
    }
    setErrors(found);

    // Move focus to the first field that needs fixing.
    const order: Field[] = ['needsIdentified', 'recommendedProductIds', 'justification'];
    const first = order.find((field) => found[field]);
    if (first === 'needsIdentified') needsRef.current?.focus();
    if (first === 'recommendedProductIds') productsRef.current?.querySelector('input')?.focus();
    if (first === 'justification') justificationRef.current?.focus();
  }

  return (
    <form className="summary" onSubmit={handleSubmit} noValidate>
      <Transcript client={client} messages={messages} label="Show the interview transcript" />

      <TextField
        ref={needsRef}
        label={`What needs did you identify for ${firstName}?`}
        hint="Include anything that affects which products are suitable."
        value={draft.needsIdentified}
        maxLength={SUMMARY_LIMITS.maxNeedsChars}
        error={errors.needsIdentified}
        onChange={(value) => change({ needsIdentified: value })}
      />

      <ProductChoices
        ref={productsRef}
        products={products}
        selected={draft.recommendedProductIds}
        error={errors.recommendedProductIds}
        onToggle={toggleProduct}
      />

      <TextField
        ref={justificationRef}
        label="Why do these products suit the client?"
        hint="Link each product to the needs it meets, and mention anything you ruled out."
        value={draft.justification}
        maxLength={SUMMARY_LIMITS.maxJustificationChars}
        error={errors.justification}
        onChange={(value) => change({ justification: value })}
      />

      <div className="button-row">
        <button type="submit" className="button">
          Submit for feedback
        </button>
        {canGoBack && (
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back to the interview
          </button>
        )}
      </div>
    </form>
  );
}

interface TextFieldProps {
  ref: Ref<HTMLTextAreaElement>;
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  error: string | undefined;
  onChange: (value: string) => void;
}

function TextField({ ref, label, hint, value, maxLength, error, onChange }: TextFieldProps) {
  const id = useId();
  const describedBy = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <p id={`${id}-hint`} className="field__hint">
        {hint} ({value.length}/{maxLength} characters)
      </p>
      <textarea
        id={id}
        ref={ref}
        rows={5}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

interface ProductChoicesProps {
  ref: Ref<HTMLFieldSetElement>;
  products: Product[];
  selected: string[];
  error: string | undefined;
  onToggle: (id: string, checked: boolean) => void;
}

function ProductChoices({ ref, products, selected, error, onToggle }: ProductChoicesProps) {
  const id = useId();
  const groups = groupByCategory(products);

  return (
    <fieldset
      ref={ref}
      className="field summary__products"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="field__label">Which products do you recommend?</legend>
      <p className="field__hint">Choose one or more. Details are in the product list.</p>
      <div className="summary__groups">
        {groups.map((group) => (
          <fieldset key={group.category} className="summary__group">
            <legend className="summary__group-label">{group.label}</legend>
            {group.products.map((product) => (
              <label key={product.id} className="summary__choice">
                <input
                  type="checkbox"
                  checked={selected.includes(product.id)}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => onToggle(product.id, e.target.checked)}
                />
                <span>
                  {product.name}
                  {product.shariaCompliant && (
                    <>
                      {' '}
                      <span className="badge badge--sharia">Sharia</span>
                    </>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
