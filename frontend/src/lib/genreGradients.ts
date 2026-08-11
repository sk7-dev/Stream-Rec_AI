export const GENRE_GRADIENTS: Record<string, string> = {
  action: "from-orange-500 to-red-600",
  comedy: "from-amber-400 to-pink-500",
  drama: "from-indigo-500 to-purple-600",
  thriller: "from-slate-700 to-slate-900",
  "sci-fi": "from-cyan-500 to-blue-700",
  horror: "from-red-900 to-neutral-900",
  romance: "from-pink-400 to-rose-600",
  documentary: "from-teal-500 to-emerald-700",
  animation: "from-sky-400 to-indigo-500",
  biography: "from-yellow-600 to-orange-700",
  war: "from-stone-600 to-neutral-800",
  adventure: "from-lime-500 to-green-700",
  fantasy: "from-fuchsia-500 to-violet-700",
  crime: "from-zinc-700 to-black",
  mystery: "from-purple-800 to-neutral-900",
  music: "from-pink-500 to-purple-600",
  "film-noir": "from-neutral-700 to-black",
  western: "from-amber-700 to-orange-900",
  family: "from-teal-400 to-cyan-600",
};

export const DEFAULT_GRADIENT = "from-neutral-500 to-neutral-700";

export function gradientFor(genre?: string): string {
  if (!genre) return DEFAULT_GRADIENT;
  return GENRE_GRADIENTS[genre.toLowerCase()] ?? DEFAULT_GRADIENT;
}

export const GENRE_LIST = Object.keys(GENRE_GRADIENTS);
