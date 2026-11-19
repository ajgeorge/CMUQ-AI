import { useId, useState } from 'react';
import type { Product } from '@bank-sim/shared';
import { capitalise, groupByCategory } from '../product-groups';
import './ProductPanel.css';

/**
 * The bank's product information, as a relationship manager would have it to hand.
 * Always visible beside the chat on wide screens; behind a toggle on narrow ones.
 */
export function ProductPanel({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();

  return (
    <aside className={`products${open ? ' products--open' : ''}`} aria-labelledby={headingId}>
      <div className="products__header">
        <h2 id={headingId} className="products__title">
          Products
        </h2>
        <button
          type="button"
          className="button button--secondary products__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide products' : 'Show products'}
        </button>
      </div>

      <div id={bodyId} className="products__body">
        <p className="products__intro">Select a product to see its details.</p>
        {groupByCategory(products).map((group) => (
          <div key={group.category}>
            <h3 className="products__category">{group.label}</h3>
            <ul className="products__list">
              {group.products.map((product) => (
                <li key={product.id}>
                  <ProductDetails product={product} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ProductDetails({ product }: { product: Product }) {
  return (
    <details className="product">
      <summary className="product__summary">
        <span className="product__name">{product.name}</span>
        {product.shariaCompliant && <span className="badge badge--sharia">Sharia</span>}
      </summary>
      <div className="product__details">
        <p>{product.summary}</p>
        <p className="product__facts">
          <span className="badge">{capitalise(product.type)}</span>{' '}
          <span className={`badge${product.shariaCompliant ? ' badge--sharia' : ''}`}>
            {product.shariaCompliant ? 'Sharia-compliant' : 'Conventional'}
          </span>
        </p>
        <DetailList title="Features" items={product.features} />
        <DetailList title="Limitations" items={product.limitations} />
        <DetailList title="Eligibility" items={product.eligibility} />
        <h4 className="product__heading">Fees</h4>
        <p>{product.fees}</p>
      </div>
    </details>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <h4 className="product__heading">{title}</h4>
      <ul className="product__items">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
