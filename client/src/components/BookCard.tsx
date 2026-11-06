import { formatMinutes, pretty, type Book, type Reason } from "../api";

const ICON: Record<Reason["component"], string> = {
  genre: "◆",
  time: "◷",
  mood: "☾",
  shelf: "↺",
  popularity: "★",
};

export function BookCard(props: {
  book: Book;
  reasons?: Reason[];
  score?: number;
  actions: React.ReactNode;
}) {
  const { book, reasons, score } = props;
  return (
    <article className="card">
      <div className="spine" data-genre={book.genres[0]}>
        <span>{book.title}</span>
      </div>
      <div className="card-body">
        <header>
          <h3>{book.title}</h3>
          <p className="byline">
            {book.author} · {book.year < 1000 ? `c. ${book.year}` : book.year} · {formatMinutes(book.readingMinutes)}
          </p>
        </header>
        <p className="blurb">{book.blurb}</p>
        <div className="chips">
          {book.genres.map((g) => <span key={g} className="chip">{pretty(g)}</span>)}
          {book.moods.map((m) => <span key={m} className="chip mood">{m}</span>)}
        </div>
        {reasons && reasons.length > 0 && (
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r.component}>
                <span className="icon">{ICON[r.component]}</span>
                {r.text}
              </li>
            ))}
          </ul>
        )}
        <footer>
          {score !== undefined && (
            <span className="match" title="Weighted relevance score">
              <span className="bar" style={{ width: `${Math.round(score * 100)}%` }} />
              {Math.round(score * 100)}% match
            </span>
          )}
          <div className="actions">{props.actions}</div>
        </footer>
      </div>
    </article>
  );
}
