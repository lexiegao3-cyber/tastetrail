import { AnimatePresence, motion } from "motion/react";
import { formatMinutes, pretty, type Book, type Reason } from "../api";

export function BookDetail(props: {
  book: Book | null;
  reasons?: Reason[];
  score?: number;
  actions?: React.ReactNode;
  empty: React.ReactNode;
}) {
  const { book } = props;
  return (
    <div className="detail" aria-live="polite">
      <AnimatePresence mode="wait">
        {book ? (
          <motion.article
            key={book.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <header>
              <h2>{book.title}</h2>
              <p className="byline">
                {book.author}, {book.year < 1000 ? `around ${book.year} AD` : book.year}. About {formatMinutes(book.readingMinutes)} at your pace.
              </p>
            </header>
            <p className="blurb">{book.blurb}</p>
            {props.reasons && props.reasons.length > 0 && (
              <div className="why">
                <h3>Why it's here</h3>
                <ul>
                  {props.reasons.map((r) => (
                    <li key={r.component}>
                      <span className="track" aria-hidden="true"><span className="weight" style={{ width: `${Math.min(100, Math.max(8, Math.round(r.contribution * 200)))}%` }} /></span>
                      {r.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="tags">
              {book.genres.map(pretty).join(", ")}; feels {book.moods.join(" and ")}
            </p>
            {props.actions && <div className="actions">{props.actions}</div>}
          </motion.article>
        ) : (
          <motion.div key="empty" className="detail-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {props.empty}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
