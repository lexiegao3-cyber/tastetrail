import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatMinutes, type Book } from "../api";

/** Spine width tracks reading time, so a long book looks long on the shelf. */
export function spineWidth(minutes: number): number {
  return Math.round(Math.min(92, Math.max(30, 18 + Math.sqrt(minutes) * 2.2)));
}

function spineHeight(book: Book): number {
  // Deterministic variation per book so the shelf has a natural skyline.
  let h = 0;
  for (const ch of book.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 190 + (h % 70);
}

export function Shelf(props: {
  books: Book[];
  selectedId?: string | null;
  onSelect?: (b: Book) => void;
  /** Stagger books onto the shelf on first render (landing page). */
  entrance?: boolean;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="shelf" role="listbox" aria-label={props.label}>
      <div className="shelf-inner">
      <div className="shelf-row">
        <AnimatePresence mode="popLayout" initial={props.entrance ?? false}>
          {props.books.map((b, i) => (
            <motion.button
              key={b.id}
              layout={!reduce}
              role="option"
              aria-selected={props.selectedId === b.id}
              className={`spine g-${b.genres[0]}${props.selectedId === b.id ? " selected" : ""}`}
              style={{ width: spineWidth(b.readingMinutes), height: spineHeight(b) }}
              onClick={() => props.onSelect?.(b)}
              title={`${b.title} by ${b.author}, about ${formatMinutes(b.readingMinutes)}`}
              initial={reduce ? { opacity: 0 } : { y: -260, opacity: 0, rotate: i % 2 ? 4 : -4 }}
              animate={{ y: props.selectedId === b.id ? -14 : 0, opacity: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0, transition: { duration: 0.25 } }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 26,
                delay: props.entrance && !reduce ? 0.15 + i * 0.07 : 0,
              }}
            >
              <span className="spine-title">{b.title}</span>
              <span className="spine-author">{b.author.split(" ").slice(-1)[0]}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="plank" aria-hidden="true" />
      </div>
    </div>
  );
}
