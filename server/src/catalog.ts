/**
 * Seed catalog. Page counts are approximate for common editions; reading
 * time is derived from them at runtime so a user's reading speed can be
 * applied consistently.
 */
export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  pages: number;
  genres: string[];
  moods: string[];
  /** 0..1 prior from long-run popularity; used only as a weak tie-breaker. */
  popularity: number;
  blurb: string;
}

export const GENRES = [
  "literary",
  "science-fiction",
  "fantasy",
  "mystery",
  "thriller",
  "historical",
  "romance",
  "nonfiction",
  "memoir",
  "science",
  "business",
  "philosophy",
  "classic",
  "horror",
] as const;

export const MOODS = ["reflective", "adventurous", "dark", "funny", "hopeful", "tense", "informative", "emotional"] as const;

type Genre = (typeof GENRES)[number];
type Mood = (typeof MOODS)[number];

function book(
  id: string,
  title: string,
  author: string,
  year: number,
  pages: number,
  genres: Genre[],
  moods: Mood[],
  popularity: number,
  blurb: string,
): Book {
  return { id, title, author, year, pages, genres, moods, popularity, blurb };
}

export const CATALOG: Book[] = [
  book("dune", "Dune", "Frank Herbert", 1965, 688, ["science-fiction", "classic"], ["adventurous", "dark"], 0.95, "Politics, ecology and prophecy on a desert planet."),
  book("left-hand", "The Left Hand of Darkness", "Ursula K. Le Guin", 1969, 304, ["science-fiction", "literary", "classic"], ["reflective"], 0.7, "An envoy navigates a world without fixed gender."),
  book("hail-mary", "Project Hail Mary", "Andy Weir", 2021, 496, ["science-fiction"], ["funny", "hopeful", "adventurous"], 0.9, "A lone astronaut solves problems to save Earth."),
  book("three-body", "The Three-Body Problem", "Liu Cixin", 2008, 400, ["science-fiction"], ["dark", "reflective"], 0.85, "First contact seen through physics and history."),
  book("klara", "Klara and the Sun", "Kazuo Ishiguro", 2021, 320, ["literary", "science-fiction"], ["emotional", "reflective"], 0.7, "An artificial friend observes the family she serves."),
  book("exhalation", "Exhalation", "Ted Chiang", 2019, 368, ["science-fiction", "philosophy"], ["reflective"], 0.65, "Stories on free will, memory and entropy."),
  book("murderbot", "All Systems Red", "Martha Wells", 2017, 160, ["science-fiction"], ["funny", "adventurous"], 0.7, "A security android would rather watch TV."),
  book("hobbit", "The Hobbit", "J.R.R. Tolkien", 1937, 310, ["fantasy", "classic"], ["adventurous", "hopeful"], 0.95, "A reluctant burglar joins a dwarven quest."),
  book("earthsea", "A Wizard of Earthsea", "Ursula K. Le Guin", 1968, 183, ["fantasy", "classic"], ["reflective", "adventurous"], 0.7, "A young mage confronts the shadow he unleashed."),
  book("name-wind", "The Name of the Wind", "Patrick Rothfuss", 2007, 662, ["fantasy"], ["adventurous", "emotional"], 0.85, "A legend tells his own story."),
  book("piranesi", "Piranesi", "Susanna Clarke", 2020, 272, ["fantasy", "literary"], ["reflective", "hopeful"], 0.75, "A man maps an infinite house of statues and tides."),
  book("circe", "Circe", "Madeline Miller", 2018, 393, ["fantasy", "historical", "literary"], ["emotional", "reflective"], 0.85, "The witch of Aiaia reclaims her myth."),
  book("mistborn", "Mistborn: The Final Empire", "Brandon Sanderson", 2006, 541, ["fantasy"], ["adventurous", "tense"], 0.85, "A heist against an immortal emperor."),
  book("roger-ackroyd", "The Murder of Roger Ackroyd", "Agatha Christie", 1926, 312, ["mystery", "classic"], ["tense"], 0.8, "Poirot and a village full of secrets."),
  book("big-sleep", "The Big Sleep", "Raymond Chandler", 1939, 231, ["mystery", "classic"], ["dark", "tense"], 0.65, "Marlowe takes a case that keeps getting bigger."),
  book("thursday-murder", "The Thursday Murder Club", "Richard Osman", 2020, 382, ["mystery"], ["funny", "hopeful"], 0.75, "Retirees investigate a very real murder."),
  book("secret-history", "The Secret History", "Donna Tartt", 1992, 559, ["literary", "mystery"], ["dark", "tense"], 0.8, "Classics students and a death they caused."),
  book("gone-girl", "Gone Girl", "Gillian Flynn", 2012, 432, ["thriller", "mystery"], ["dark", "tense"], 0.85, "A marriage told by two unreliable narrators."),
  book("silent-patient", "The Silent Patient", "Alex Michaelides", 2019, 336, ["thriller"], ["tense", "dark"], 0.75, "A therapist obsessed with a woman who won't speak."),
  book("day-jackal", "The Day of the Jackal", "Frederick Forsyth", 1971, 400, ["thriller", "historical"], ["tense"], 0.6, "An assassin and the detective racing him."),
  book("wolf-hall", "Wolf Hall", "Hilary Mantel", 2009, 604, ["historical", "literary"], ["reflective", "tense"], 0.75, "Thomas Cromwell rises in Henry VIII's court."),
  book("all-light", "All the Light We Cannot See", "Anthony Doerr", 2014, 531, ["historical", "literary"], ["emotional", "hopeful"], 0.85, "Two young lives converge in occupied France."),
  book("pachinko", "Pachinko", "Min Jin Lee", 2017, 490, ["historical", "literary"], ["emotional"], 0.8, "Four generations of a Korean family in Japan."),
  book("pride", "Pride and Prejudice", "Jane Austen", 1813, 432, ["romance", "classic"], ["funny", "hopeful"], 0.95, "Elizabeth Bennet and a proud Mr Darcy."),
  book("persuasion", "Persuasion", "Jane Austen", 1817, 249, ["romance", "classic"], ["reflective", "emotional"], 0.65, "A second chance, eight years later."),
  book("normal-people", "Normal People", "Sally Rooney", 2018, 266, ["literary", "romance"], ["emotional"], 0.75, "Two people who keep finding each other."),
  book("tomorrow", "Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 2022, 416, ["literary"], ["emotional", "hopeful"], 0.8, "Friends who make video games together."),
  book("remains-day", "The Remains of the Day", "Kazuo Ishiguro", 1989, 258, ["literary", "classic"], ["reflective", "emotional"], 0.75, "A butler's road trip through his regrets."),
  book("frankenstein", "Frankenstein", "Mary Shelley", 1818, 280, ["horror", "classic", "science-fiction"], ["dark", "reflective"], 0.85, "A creator abandons his creation."),
  book("haunting", "The Haunting of Hill House", "Shirley Jackson", 1959, 246, ["horror", "classic"], ["dark", "tense"], 0.7, "Four guests and a house that wants one of them."),
  book("mexican-gothic", "Mexican Gothic", "Silvia Moreno-Garcia", 2020, 301, ["horror", "historical"], ["dark", "tense"], 0.7, "A decaying mansion hides a family's rot."),
  book("sapiens", "Sapiens", "Yuval Noah Harari", 2011, 443, ["nonfiction", "science"], ["informative", "reflective"], 0.9, "A brief history of humankind."),
  book("thinking-fast", "Thinking, Fast and Slow", "Daniel Kahneman", 2011, 499, ["nonfiction", "science", "business"], ["informative"], 0.85, "Two systems of thought and their biases."),
  book("gene", "The Gene: An Intimate History", "Siddhartha Mukherjee", 2016, 592, ["nonfiction", "science"], ["informative", "emotional"], 0.7, "Heredity told through science and family."),
  book("brief-history-time", "A Brief History of Time", "Stephen Hawking", 1988, 212, ["nonfiction", "science"], ["informative", "reflective"], 0.85, "Cosmology for the curious reader."),
  book("signal-noise", "The Signal and the Noise", "Nate Silver", 2012, 544, ["nonfiction", "business", "science"], ["informative"], 0.65, "Why most predictions fail, and some don't."),
  book("flash-boys", "Flash Boys", "Michael Lewis", 2014, 288, ["nonfiction", "business"], ["informative", "tense"], 0.7, "High-frequency trading and the people who fought it."),
  book("zero-one", "Zero to One", "Peter Thiel", 2014, 224, ["nonfiction", "business"], ["informative"], 0.75, "Notes on building something new."),
  book("educated", "Educated", "Tara Westover", 2018, 334, ["memoir", "nonfiction"], ["emotional", "hopeful"], 0.9, "From a survivalist family to a Cambridge PhD."),
  book("when-breath", "When Breath Becomes Air", "Paul Kalanithi", 2016, 228, ["memoir", "nonfiction"], ["emotional", "reflective"], 0.8, "A neurosurgeon faces his own diagnosis."),
  book("meditations", "Meditations", "Marcus Aurelius", 180, 254, ["philosophy", "classic", "nonfiction"], ["reflective"], 0.85, "A Roman emperor's private notes on living well."),
  book("mans-search", "Man's Search for Meaning", "Viktor Frankl", 1946, 165, ["philosophy", "memoir", "nonfiction"], ["reflective", "hopeful"], 0.85, "Finding purpose in the camps and after."),
];

export const BOOKS_BY_ID: ReadonlyMap<string, Book> = new Map(CATALOG.map((b) => [b.id, b]));
