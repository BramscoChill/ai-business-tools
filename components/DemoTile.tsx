import Link from "next/link";

export type Demo = {
  slug: string;
  icon: string;
  title: string;
  description: string;
  live: boolean;
};

export function DemoTile({ demo }: { demo: Demo }) {
  const card = (
    <div
      className={`flex h-full flex-col gap-3 rounded-2xl border border-black/10 bg-white p-6 shadow-sm transition dark:border-white/15 dark:bg-white/5 ${
        demo.live
          ? "hover:-translate-y-1 hover:shadow-lg hover:border-black/20 dark:hover:border-white/30"
          : "opacity-60"
      }`}
    >
      <div className="text-4xl">{demo.icon}</div>
      <h2 className="text-lg font-semibold">{demo.title}</h2>
      <p className="text-sm text-black/60 dark:text-white/60">{demo.description}</p>
      <span className="mt-auto pt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
        {demo.live ? "Open demo →" : "Coming soon"}
      </span>
    </div>
  );

  if (!demo.live) return card;
  return (
    <Link href={`/${demo.slug}`} className="block h-full">
      {card}
    </Link>
  );
}
