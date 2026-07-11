import { useTranslations } from "next-intl";

export interface VideoResource {
  title: string;
  provider: string;
  lang: "it" | "en";
  url: string;
  kind: string;
}

export interface VideoListProps {
  resources: VideoResource[];
}

/** Curated video resources for a topic, as external links — provider badge + lang chip. */
export function VideoList({ resources }: VideoListProps) {
  const t = useTranslations("session");
  const videos = resources.filter((r) => r.kind === "video");

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("videos")}</h2>
      {videos.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("noVideos")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {videos.map((v) => (
            <li key={v.url}>
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-black/[.08] px-4 py-3 hover:bg-black/[.03] dark:border-white/[.15] dark:hover:bg-white/[.05]"
              >
                <span className="flex-1">{v.title}</span>
                <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">{v.provider}</span>
                <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs uppercase dark:bg-white/[.1]">{v.lang}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
